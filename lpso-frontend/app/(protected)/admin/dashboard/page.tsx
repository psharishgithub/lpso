'use client'

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserButton } from "@/components/auth/user-button";
import { Inbox, MessageSquare, File, Settings, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SettingsPage from '../../settings/page';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
// import { useToast } from "@/components/hooks/use-toast";

const AdminDashboard = () => {
  const router = useRouter()
  // const { toast } = useToast()
  const [companyFiles, setCompanyFiles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('documents');
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = async () => {
    try {
      const response = await fetch('http://localhost:8000/list_files');
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      const data = await response.json();
      setCompanyFiles(data.company_files);
      setIsLoading(false);
    } catch (err) {
      setError('Failed to load files. Please try again later.');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleInbox = () => {
    console.log('Inbox clicked');
  };

  const handleChat = () => {
    router.push('/landing')
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      console.log('No file selected');
      return;
    }
  
    setIsUploading(true);
  
    const formData = new FormData();
    formData.append('files', file);
  
    try {
      const response = await fetch('http://localhost:8000/upload_company_documents', {
        method: 'POST',
        body: formData,
      });
  
      if (response.ok) {
        // toast({
        //   title: "Success",
        //   description: "File uploaded successfully",
        // });
        fetchFiles(); // Refresh the file list
      } else {
        throw new Error('File upload failed');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      // toast({
      //   title: "Error",
      //   description: "Failed to upload file",
      //   variant: "destructive",
      // });
    } finally {
      setIsUploading(false);
      setFile(null);
    }
  };

  const handleDelete = async (filePath: string) => {
    console.log(`Attempting to delete file at: company/${filePath}`); // Log the path being sent
    try {
      const response = await fetch(`http://localhost:8000/delete_file?file_path=company/${encodeURIComponent(filePath)}`, {
        method: 'DELETE',
      });
  
      console.log(`Response status: ${response.status}`); // Log response status
      if (response.ok) {
        console.log('File deleted successfully');
        fetchFiles(); // Refresh the file list
      } else {
        const errorText = await response.text();
        console.error(`Error response: ${errorText}`); // Log error response
        throw new Error(`File deletion failed: ${errorText}`);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      // Optionally show a toast notification for errors
    }
  };
  
  
  

  const getFileIcon = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase();
    switch(extension) {
      case 'pdf': return <File className="h-5 w-5 text-red-500" />;
      case 'xlsx': case 'xls': return <File className="h-5 w-5 text-green-500" />;
      case 'docx': case 'doc': return <File className="h-5 w-5 text-blue-500" />;
      case 'pptx': case 'ppt': return <File className="h-5 w-5 text-orange-500" />;
      default: return <File className="h-5 w-5 text-gray-400" />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white shadow-md p-2 gap-2">
        <div className="p-4">
          <h1 className="text-2xl font-bold text-gray-800">LPSO Admin</h1>
        </div>
        <nav className="mt-4">
          <Button 
            variant={activeTab === 'documents' ? "default" : "ghost"}
            className="w-full justify-start" 
            onClick={() => setActiveTab('documents')}
          >
            <File className="mr-2 h-4 w-4" /> Documents
          </Button>
          
          <Button 
            variant={activeTab === 'settings' ? "default" : "ghost"}
            className="w-full justify-start" 
            onClick={() => setActiveTab('settings')}
          >
            <Settings className="mr-2 h-4 w-4" /> Settings
          </Button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <header className="bg-white shadow-sm p-4 flex justify-between items-center">
          <div className="flex space-x-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Upload PDF
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Upload PDF</DialogTitle>
                  <DialogDescription>
                    Choose a PDF file to upload to the system.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="pdf-file" className="text-right">
                      PDF File
                    </Label>
                    <Input
                      id="pdf-file"
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="col-span-3"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleUpload} disabled={isUploading || !file}>
                    {isUploading ? 'Uploading...' : 'Upload'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button onClick={handleInbox} variant="outline" size="sm">
              <Inbox className="mr-2 h-4 w-4" /> Inbox
            </Button>
            <Button onClick={handleChat} variant="outline" size="sm">
              <MessageSquare className="mr-2 h-4 w-4" /> Chat
            </Button>
          </div>
          <UserButton />
        </header>

        <main className="p-6">
          <div className="mb-6">
            <Input
              type="text"
              placeholder="Search..."
              className="w-full max-w-md"
            />
          </div>

          {activeTab === 'documents' && (
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Available Documents</h2>
                {isLoading ? (
                  <p>Loading files...</p>
                ) : error ? (
                  <p className="text-red-500">{error}</p>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {companyFiles.map((file, index) => (
                      <li key={index} className="py-4 flex items-center justify-between">
                        <div className="flex items-center">
                          {getFileIcon(file)}
                          <span className="ml-3 text-sm font-medium text-gray-900">{file}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(file)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Settings</h2>
              <SettingsPage/>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;