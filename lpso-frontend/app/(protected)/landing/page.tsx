'use client'
import React, { useState, useRef, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImAttachment } from "react-icons/im";
import { UserButton } from "@/components/auth/user-button";
import Link from 'next/link';
import { RoleGate } from '@/components/auth/role-gate';
import { UserRole } from "@prisma/client";
import axios from 'axios';
import { useSession } from 'next-auth/react';
import { FaTimes } from 'react-icons/fa';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Message {
  text: string;
  isBot: boolean;
  isFileUpload?: boolean;
  fileId?: string;
}

export default function Landing() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([
    { text: "On the other hand, we denounce with righteous indignation...", isBot: true },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [botTyping, setBotTyping] = useState(false);
  const [fileCount, setFileCount] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [youtubeLink, setYoutubeLink] = useState("");
  const [websiteLink, setWebsiteLink] = useState("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    const fetchFileCount = async () => {
      try {
        const response = await axios.get('http://localhost:8000/list_files');
        const data = response.data;
        const employeeId = session?.user?.id;

        if (employeeId && data.employee_files[employeeId]) {
          setFileCount(data.employee_files[employeeId].length);
        } else {
          setFileCount(0);
        }
      } catch (error) {
        console.error("Error fetching file count:", error);
        setFileCount(0);
      }
    };

    fetchFileCount();
  }, [session]);

  const handleSendMessage = async () => {
    if ((inputMessage.trim() || uploadedFiles.length > 0) && !loading) {
      setLoading(true);

      const newMessages: Message[] = [
        ...messages,
        { text: inputMessage, isBot: false },
        ...uploadedFiles.map(file => ({ text: `File uploaded: ${file.name}`, isBot: false, isFileUpload: true, fileId: file.name }))
      ];
      setMessages(newMessages);
      setInputMessage("");
      setUploadedFiles([]);

      try {
        if (inputMessage.trim() === "/query") {
          setMessages((prev) => [
            ...prev,
            { text: "Would you like to raise a query?", isBot: true },
          ]);
          setLoading(false);
          return;
        }

        if (inputMessage.trim()) {
          setBotTyping(true);
          const response = await axios.post("http://localhost:8000/chat", {
            message: inputMessage,
          });

          const botReply = response.data.response;

          setMessages((prev) => [
            ...prev,
            { text: botReply, isBot: true },
          ]);
          setBotTyping(false);
        }

        if (uploadedFiles.length > 0 && session?.user?.id) {
          const formData = new FormData();
          uploadedFiles.forEach((file) => {
            formData.append("files", file);
          });

          await axios.post(`http://localhost:8000/upload_employee_documents/${session.user.id}`, formData, {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          });

          console.log("Files uploaded successfully.");
          // Update file count after successful upload
          const response = await axios.get('http://localhost:8000/list_files');
          const data = response.data;
          if (session?.user?.id && data.employee_files[session.user.id]) {
            setFileCount(data.employee_files[session.user.id].length);
          }
        }
      } catch (error) {
        console.error("Error processing request:", error);
        setMessages((prev) => [
          ...prev,
          { text: "Sorry, there was an error processing your request.", isBot: true },
        ]);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!loading) {
      const files = event.target.files;
      if (files && files.length > 0) {
        const filesArray = Array.from(files);
        setUploadedFiles((prevFiles) => [...prevFiles, ...filesArray]);
        event.target.value = "";
      }
    }
  };

  const handleDeleteFile = (index: number) => {
    if (!loading) {
      setUploadedFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
    }
  };

  const handleSummarize = async (employeeId: string, filename: string) => {
    try {
      const response = await axios.post(
        `http://localhost:8000/summarize_employee_document/${employeeId}/${filename}`
      );
      const summary = response.data.summary;
      setMessages((prev) => [
        ...prev,
        { text: `Summary: ${summary}`, isBot: true },
      ]);
    } catch (error) {
      console.error("Error summarizing file:", error);
      setMessages((prev) => [
        ...prev,
        { text: "Sorry, there was an error summarizing the file.", isBot: true },
      ]);
    }
  };

  const handleExtractKeywords = async (fileId: string) => {
    try {
      const response = await axios.post(`http://localhost:8000/extract_keywords/${fileId}`);
      const keywords = response.data.keywords;
      setMessages((prev) => [
        ...prev,
        { text: `Keywords: ${keywords.join(', ')}`, isBot: true },
      ]);
    } catch (error) {
      console.error("Error extracting keywords:", error);
      setMessages((prev) => [
        ...prev,
        { text: "Sorry, there was an error extracting keywords.", isBot: true },
      ]);
    }
  };

  const handleClearFiles = async () => {
    if (session?.user?.id) {
      try {
        await axios.delete(`http://127.0.0.1:8000/remove_employee_documents/${session.user.id}`);
        setFileCount(0);
        setMessages(prev => [...prev, { text: "All files have been cleared.", isBot: true }]);
      } catch (error) {
        console.error("Error clearing files:", error);
        setMessages(prev => [...prev, { text: "Sorry, there was an error clearing your files.", isBot: true }]);
      }
    }
  };

  const handleYoutubeUpload = async () => {
    try {
      await axios.post('http://localhost:8000/upload_youtube', { url: youtubeLink });
      setMessages(prev => [...prev, { text: "YouTube video uploaded successfully.", isBot: true }]);
      setYoutubeLink("");
    } catch (error) {
      console.error("Error uploading YouTube video:", error);
      setMessages(prev => [...prev, { text: "Sorry, there was an error uploading the YouTube video.", isBot: true }]);
    }
    setIsDialogOpen(false);
  };

  const handleWebsiteUpload = async () => {
    try {
      await axios.post('http://localhost:8000/upload_website', { url: websiteLink });
      setMessages(prev => [...prev, { text: "Website content uploaded successfully.", isBot: true }]);
      setWebsiteLink("");
    } catch (error) {
      console.error("Error uploading website content:", error);
      setMessages(prev => [...prev, { text: "Sorry, there was an error uploading the website content.", isBot: true }]);
    }
    setIsDialogOpen(false);
  };


  return (
    <div className="min-h-screen flex flex-col">
      <header className="fixed top-0 left-0 right-0 bg-white p-4 shadow-sm z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="text-4xl font-extrabold text-gray-800">LSPO</div>
          <div className="flex items-center gap-4">
            <RoleGate allowedRole={UserRole.ADMIN}>
              <Link href="/admin/dashboard">
                <Button className="bg-blue-500 text-white px-4 py-2 rounded-md">Admin Console</Button>
              </Link>
            </RoleGate>
            <UserButton />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 pb-24 mt-[80px]">
        <div className="max-w-[750px] mx-auto">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 ${message.isBot ? "text-left" : "text-right"}`}
            >
              <div
                className={`inline-block p-3 rounded-lg ${
                  message.isBot
                    ? "bg-white text-gray-800"
                    : message.isFileUpload
                    ? "bg-teal-700 text-white"
                    : "bg-white text-black"
                } break-words whitespace-pre-wrap max-w-full`}
              >
                {message.isFileUpload ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm">{message.text}</p>
                    <div className="flex gap-2">
                      <Button
                        className="bg-yellow-500 text-white px-2 py-1 rounded-md text-sm"
                        onClick={() =>
                          handleSummarize(session?.user?.id || '', message.fileId || '')
                        }
                      >
                        Summarize
                      </Button>
                    </div>
                  </div>
                ) : (
                  message.text
                )}
              </div>
            </div>
          ))}
          {botTyping && (
            <div className="text-left mb-4">
              <div className="inline-block p-3 rounded-lg bg-gray-200 text-gray-800">
                Bot is typing
                <span className="inline-flex ml-1">
                  <span className="animate-bounce mx-0.5 delay-0">.</span>
                  <span className="animate-bounce mx-0.5 delay-150">.</span>
                  <span className="animate-bounce mx-0.5 delay-300">.</span>
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 pl-4 flex justify-center bg-transparent">
        <div className="flex flex-col items-start gap-3 p-1 border rounded-t-2xl bg-white shadow-2xl max-w-[800px] w-full">
          {fileCount !== null && (
            <div className="flex justify-between items-center w-full">
              <div className="text-sm text-gray-600">
                Files uploaded: {fileCount}
              </div>
              <Button
                className="bg-red-500 text-white px-2 py-1 rounded-md text-xs"
                onClick={handleClearFiles}
              >
                Clear Files
              </Button>
            </div>
          )}
          {uploadedFiles.length > 0 && (
            <div className="w-full">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center bg-gray-100 p-2 rounded-md justify-between">
                  <p className="text-sm text-gray-800">{file.name}</p>
                  <Button
                    className="bg-red-500 text-white px-2 py-1 rounded-md text-xs"
                    onClick={() => handleDeleteFile(index)}
                  >
                    <FaTimes />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center w-full gap-2">
            <Input
              placeholder="Type your message..."
              className="flex-1 p-2 border rounded-md"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              disabled={loading}
            />
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon">
                  <ImAttachment className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Upload Content</DialogTitle>
                  <DialogDescription>
                    Choose a file to upload or paste a link.
                  </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="file" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="file">PDF</TabsTrigger>
                    <TabsTrigger value="youtube">YouTube</TabsTrigger>
                    <TabsTrigger value="website">Website</TabsTrigger>
                  </TabsList>
                  <TabsContent value="file">
                    <Input
                      id="file-upload"
                      type="file"
                      accept=".pdf,.pptx,.ppt,.docx,.doc,image/*"
                      onChange={handleFileUpload}
                    />
                  </TabsContent>
                  <TabsContent value="youtube">
                    <Input
                      placeholder="Paste YouTube link"
                      value={youtubeLink}
                      onChange={(e) => setYoutubeLink(e.target.value)}
                    />
                    <Button onClick={handleYoutubeUpload}>Upload YouTube</Button>
                  </TabsContent>
                  <TabsContent value="website">
                    <Input
                      placeholder="Paste website link"
                      value={websiteLink}
                      onChange={(e) => setWebsiteLink(e.target.value)}
                    />
                    <Button onClick={handleWebsiteUpload}>Upload Website</Button>
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
            <Button
              className="bg-green-500 text-white px-4 py-2 rounded-md"
              onClick={handleSendMessage}
              disabled={loading}
            >
              {loading ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}