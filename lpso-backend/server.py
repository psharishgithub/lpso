
import os
import shutil
import httpx
from typing import List
from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain.chains.history_aware_retriever import create_history_aware_retriever
from langchain.chains.retrieval import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.document_loaders import PyPDFLoader, WebBaseLoader, YoutubeLoader
from langchain_groq import ChatGroq
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_ollama.chat_models import ChatOllama
from langchain_openai.chat_models import ChatOpenAI

# Load environment variables from .env
load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define the persistent directory
current_dir = os.path.dirname(os.path.abspath(__file__))
db_dir = os.path.join(current_dir, "db")
documents_dir = os.path.join(current_dir, "documents")

# Global variables to store embeddings, retrievers, and rag_chains
company_data = {}

class ChatRequest(BaseModel):
    message: str

class WebsiteUploadRequest(BaseModel):
    url: str

class YouTubeUploadRequest(BaseModel):
    url: str

def increment_request_counter():
    company_data["request_count"] = company_data.get("request_count", 0) + 1

def load_pdf_documents(pdf_directory: str) -> List[Document]:
    documents = []
    for filename in os.listdir(pdf_directory):
        if filename.endswith('.pdf'):
            file_path = os.path.join(pdf_directory, filename)
            print(f"Loading PDF: {file_path}")
            loader = PyPDFLoader(file_path)
            documents.extend(loader.load())
    return documents

def load_website_content(url: str) -> List[Document]:
    print(f"Loading website content from: {url}")
    loader = WebBaseLoader([url])
    return loader.load()

def load_youtube_transcript(url: str) -> List[Document]:
    print(f"Loading YouTube transcript from: {url}")
    loader = YoutubeLoader.from_youtube_url(url, add_video_info=True)
    return loader.load()

def split_documents(documents: List[Document]) -> List[Document]:
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    return text_splitter.split_documents(documents)

def create_vector_store(docs: List[Document], embeddings, store_name: str):
    persistent_directory = os.path.join(db_dir, store_name)
    if not os.path.exists(persistent_directory):
        print(f"\n--- Creating vector store {store_name} ---")
        Chroma.from_documents(
            docs, embeddings, persist_directory=persistent_directory)
        print(f"--- Finished creating vector store {store_name} ---")
    else:
        print(f"Vector store {store_name} already exists. Updating with new documents.")
        db = Chroma(persist_directory=persistent_directory, embedding_function=embeddings)
        db.add_documents(docs)

def setup_retriever(embeddings, store_name: str):
    persistent_directory = os.path.join(db_dir, store_name)
    db = Chroma(persist_directory=persistent_directory, embedding_function=embeddings)
    return db.as_retriever(search_type="similarity", search_kwargs={"k": 3})

def setup_llm():
    # return ChatOllama(model="llama3.1")
    # return ChatGroq(model="gemma2-9b-it")
    return ChatOpenAI(model="gpt-4o-mini")

def create_contextualize_q_prompt():
    contextualize_q_system_prompt = (
        "Given a chat history and the latest user question "
        "which might reference context in the chat history, "
        "formulate a standalone question which can be understood "
        "without the chat history. Do NOT answer the question, just "
        "reformulate it if needed and otherwise return it as is."
    )
    return ChatPromptTemplate.from_messages(
        [
            ("system", contextualize_q_system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ]
    )

def create_qa_prompt():
    qa_system_prompt = (
        "You are an assistant for question-answering tasks. Use "
        "the following pieces of retrieved context to answer the "
        "question. If you don't know the answer, just say that you "
        "don't know. Use three sentences maximum and keep the answer "
        "concise."
        "\n\n"
        "{context}"
    )
    return ChatPromptTemplate.from_messages(
        [
            ("system", qa_system_prompt),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
        ]
    )

def setup_rag_chain(llm, retriever, contextualize_q_prompt, qa_prompt):
    history_aware_retriever = create_history_aware_retriever(
        llm, retriever, contextualize_q_prompt
    )
    question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)
    retrieval_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)
    return retrieval_chain, history_aware_retriever

@app.post("/upload_company_documents")
async def upload_company_documents(files: List[UploadFile] = File(...)):
    company_dir = os.path.join(documents_dir, "company")
    os.makedirs(company_dir, exist_ok=True)
    
    for file in files:
        file_path = os.path.join(company_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    
    # Process uploaded documents
    await load_documents()
    
    return {"message": "Company documents uploaded and processed"}

@app.post("/upload_employee_documents/{employee_id}")
async def upload_employee_documents(employee_id: str, files: List[UploadFile] = File(...)):
    employee_dir = os.path.join(documents_dir, "employees", employee_id)
    os.makedirs(employee_dir, exist_ok=True)
    
    for file in files:
        file_path = os.path.join(employee_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    
    # Process uploaded documents
    await load_documents()
    
    return {"message": f"Employee documents uploaded and processed for employee {employee_id}"}

@app.post("/upload_website")
async def upload_website(request: WebsiteUploadRequest):
    documents = load_website_content(request.url)
    split_docs = split_documents(documents)
    
    # Add the split documents to the vector store
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    create_vector_store(split_docs, embeddings, "enterprise")
    
    # Reload the documents to update the retriever
    await load_documents()
    
    return {"message": f"Website content from {request.url} uploaded and processed"}

@app.post("/upload_youtube")
async def upload_youtube(request: YouTubeUploadRequest):
    documents = load_youtube_transcript(request.url)
    split_docs = split_documents(documents)
    
    # Add the split documents to the vector store
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    create_vector_store(split_docs, embeddings, "enterprise")
    
    # Reload the documents to update the retriever
    await load_documents()
    
    return {"message": f"YouTube transcript from {request.url} uploaded and processed"}


# @app.post("/load_documents")
# async def load_documents():
    global company_data
    
    # Set up the embedding model
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

    # Load company documents
    company_dir = os.path.join(documents_dir, "company")
    company_documents = load_pdf_documents(company_dir)

    # Load employee documents
    employee_documents = []
    employees_dir = os.path.join(documents_dir, "employees")
    for employee in os.listdir(employees_dir):
        employee_dir = os.path.join(employees_dir, employee)
        employee_documents.extend(load_pdf_documents(employee_dir))

    # Combine all documents
    all_documents = company_documents + employee_documents
    print(f"Total number of documents: {len(all_documents)}")

    # Split documents
    split_docs = split_documents(all_documents)

    # Create or update the vector store
    create_vector_store(split_docs, embeddings, "enterprise")

    # Set up the retriever
    retriever = setup_retriever(embeddings, "enterprise")

    # Set up the language model
    llm = setup_llm()

    # Create prompts
    contextualize_q_prompt = create_contextualize_q_prompt()
    qa_prompt = create_qa_prompt()

    # Set up the RAG chain
    rag_chain, history_aware_retriever = setup_rag_chain(llm, retriever, contextualize_q_prompt, qa_prompt)

    # Store the rag_chain, retriever, and initialize chat history
    company_data["rag_chain"] = rag_chain
    company_data["retriever"] = history_aware_retriever
    company_data["chat_history"] = []

    return {"message": "All documents loaded and processed"}

@app.post("/load_documents")
async def load_documents():
    global company_data

        # Reset chat history
    if "chat_history" in company_data:
        company_data["chat_history"] = []
    
    # Set up the embedding model
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

    # Load company documents
    company_dir = os.path.join(documents_dir, "company")
    company_documents = load_pdf_documents(company_dir)

    # Load employee documents
    employee_documents = []
    employees_dir = os.path.join(documents_dir, "employees")
    if os.path.exists(employees_dir) and os.listdir(employees_dir):
        for employee in os.listdir(employees_dir):
            employee_dir = os.path.join(employees_dir, employee)
            employee_documents.extend(load_pdf_documents(employee_dir))

    # Combine all documents
    all_documents = company_documents + employee_documents
    print(f"Total number of documents: {len(all_documents)}")

    # Proceed even if only company documents are available
    if all_documents:
        # Split documents
        split_docs = split_documents(all_documents)

        # Create or update the vector store
        create_vector_store(split_docs, embeddings, "enterprise")

        # Set up the retriever
        retriever = setup_retriever(embeddings, "enterprise")

        # Set up the language model
        llm = setup_llm()

        # Create prompts
        contextualize_q_prompt = create_contextualize_q_prompt()
        qa_prompt = create_qa_prompt()

        # Set up the RAG chain
        rag_chain, history_aware_retriever = setup_rag_chain(llm, retriever, contextualize_q_prompt, qa_prompt)

        # Store the rag_chain, retriever, and initialize chat history
        company_data["rag_chain"] = rag_chain
        company_data["retriever"] = history_aware_retriever
        company_data["chat_history"] = []

        if employee_documents:
            return {"message": "All documents (company and employee) loaded and processed"}
        else:
            return {"message": "Only company documents loaded and processed. No employee documents found."}
    else:
        return {"message": "No documents found to process"}

def summarize_document(file_path):
    # Load the PDF
    loader = PyPDFLoader(file_path)
    documents = loader.load()

    # Split the documents
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    split_docs = text_splitter.split_documents(documents)

    # Set up the language model
    llm = setup_llm()

    # Create the prompt
    prompt = ChatPromptTemplate.from_template("Summarize this content: {context}")

    # Create the chain
    chain = create_stuff_documents_chain(llm, prompt)

    # Invoke the chain
    result = chain.invoke({"context": split_docs})

    return result

@app.post("/summarize_employee_document/{employee_id}/{filename}")
async def summarize_employee_document(employee_id: str, filename: str):
    # Construct the file path
    file_path = os.path.join(documents_dir, "employees", employee_id, filename)

    # Check if the file exists
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    # Check if the file is a PDF
    if not filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    try:
        # Summarize the document
        summary = summarize_document(file_path)
        return {"summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred while processing the file: {str(e)}")

@app.post("/chat")
async def chat(chat_request: ChatRequest, background_tasks: BackgroundTasks):
    if "rag_chain" not in company_data or "retriever" not in company_data:
        raise HTTPException(status_code=400, detail="Documents not loaded. Please load documents first.")

    # Check for profanity
    async with httpx.AsyncClient() as client:
        profanity_response = await client.post(
            'https://vector.profanity.dev',
            json={"message": chat_request.message}
        )
        
    if profanity_response.status_code != 200:
        raise HTTPException(status_code=500, detail="Error checking profanity")
    
    profanity_result = profanity_response.json()
    if profanity_result.get("is_profane", False):
        raise HTTPException(status_code=400, detail="Message contains profanity")

    increment_request_counter()

    rag_chain = company_data["rag_chain"]
    retriever = company_data["retriever"]
    chat_history = company_data["chat_history"]

    # First, retrieve the relevant documents
    retrieved_documents = retriever.invoke({"input": chat_request.message, "chat_history": chat_history})

    # Then, use the RAG chain to generate the answer
    result = rag_chain.invoke({"input": chat_request.message, "chat_history": chat_history})
    
    # Update chat history
    chat_history.append(HumanMessage(content=chat_request.message))
    chat_history.append(SystemMessage(content=result['answer']))

    # Prepare the retrieved chunks for the response
    retrieved_chunks = [
        {
            "content": doc.page_content,
            "metadata": doc.metadata
        } for doc in retrieved_documents
    ]

    return {
        "response": result['answer'],
        "retrieved_chunks": retrieved_chunks
    }

@app.get("/analytics")
def get_analytics():
    return JSONResponse({"request_count": company_data.get("request_count", 0)})

@app.get("/list_files")
async def list_files():
    company_files = []
    employee_files = {}

    # List company files
    company_dir = os.path.join(documents_dir, "company")
    if os.path.exists(company_dir):
        company_files = os.listdir(company_dir)

    # List employee files
    employees_dir = os.path.join(documents_dir, "employees")
    if os.path.exists(employees_dir):
        for employee in os.listdir(employees_dir):
            employee_dir = os.path.join(employees_dir, employee)
            employee_files[employee] = os.listdir(employee_dir)

    return {
        "company_files": company_files,
        "employee_files": employee_files
    }

@app.delete("/delete_file")
async def delete_file(file_path: str):
    full_path = os.path.join(documents_dir, file_path)
    if os.path.exists(full_path):
        os.remove(full_path)
        return {"message": f"File {file_path} deleted successfully"}
    else:
        raise HTTPException(status_code=404, detail="File not found")

@app.delete("/delete_embeddings")
async def delete_embeddings():
    if os.path.exists(db_dir):
        shutil.rmtree(db_dir)
        os.makedirs(db_dir)
        return {"message": "All embeddings deleted successfully"}
    else:
        raise HTTPException(status_code=404, detail="Embeddings directory not found")

@app.delete("/remove_employee_documents/{employee_id}")
async def remove_employee_documents(employee_id: str):
    employee_dir = os.path.join(documents_dir, "employees", employee_id)
    if os.path.exists(employee_dir):
        shutil.rmtree(employee_dir)
        
        # Reload all documents (excluding the deleted employee's documents)
        # await delete_embeddings()
        await load_documents()
        
        return {"message": f"All documents for employee {employee_id} have been removed and embeddings updated"}
    else:
        raise HTTPException(status_code=404, detail=f"No documents found for employee {employee_id}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
