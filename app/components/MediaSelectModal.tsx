import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Upload,
  Image as ImageIcon,
  Check,
  X,
  FileText,
  Type,
  FolderPlus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ProgressBar } from "@shopify/polaris";

export interface MediaFileItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  category: string;
  url: string;
  thumbnailUrl?: string | null;
  folder: string;
  createdByName?: string | null;
  createdByAvatar?: string | null;
  uploadedBy?: string;
  createdAt: string;
}

export interface FolderItem {
  id: string;
  name: string;
  label: string;
}

interface MediaSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selectedFiles: MediaFileItem[]) => void;
  multiSelect?: boolean;
  initialSelectedUrl?: string;
  title?: string;
  allowedCategory?: "ALL" | "IMAGE" | "FONT" | "DOCUMENT";
}

export default function MediaSelectModal({
  isOpen,
  onClose,
  onSelect,
  multiSelect = false,
  initialSelectedUrl = "",
  title = "Select file",
  allowedCategory = "ALL",
}: MediaSelectModalProps) {
  const [files, setFiles] = useState<MediaFileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([
    { id: "def-1", name: "general", label: "General" },
    { id: "def-2", name: "artworks", label: "Artworks" },
  ]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolderFilter, setSelectedFolderFilter] = useState("ALL");
  const [destinationFolder, setDestinationFolder] = useState("general");
  const [selectedCategory, setSelectedCategory] = useState<string>(allowedCategory);
  const [selectedFiles, setSelectedFiles] = useState<MediaFileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [paginationInfo, setPaginationInfo] = useState({
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // State tạo mới folder
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Fetch Media Files and Folders from API with Pagination
  const fetchMediaFilesAndFolders = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        folder: selectedFolderFilter,
        category: selectedCategory,
        search: searchQuery,
      });

      const [filesRes, foldersRes] = await Promise.all([
        fetch(`/api/assets?${query.toString()}`),
        fetch("/api/folders"),
      ]);

      if (filesRes.ok) {
        const data = await filesRes.json();
        if (data.files) {
          setFiles(data.files);
          if (data.pagination) {
            setPaginationInfo(data.pagination);
          }
          if (initialSelectedUrl && !multiSelect) {
            const match = data.files.find((f: MediaFileItem) => f.url === initialSelectedUrl);
            if (match) setSelectedFiles([match]);
          }
        }
      }

      if (foldersRes.ok) {
        const fData = await foldersRes.json();
        if (fData.folders) {
          setFolders(fData.folders);
        }
      }
    } catch (err) {
      console.error("Error fetching media files/folders for modal:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, selectedFolderFilter, selectedCategory, searchQuery, initialSelectedUrl, multiSelect]);

  useEffect(() => {
    if (isOpen) {
      fetchMediaFilesAndFolders();
    } else {
      setSelectedFiles([]);
      setSearchQuery("");
      setPage(1);
      setShowCreateFolderModal(false);
      setNewFolderName("");
    }
  }, [isOpen, fetchMediaFilesAndFolders]);

  if (!isOpen) return null;

  // Toggle selection
  const handleToggleSelect = (file: MediaFileItem) => {
    if (multiSelect) {
      setSelectedFiles((prev) =>
        prev.some((f) => f.id === file.id)
          ? prev.filter((f) => f.id !== file.id)
          : [...prev, file]
      );
    } else {
      setSelectedFiles([file]);
    }
  };

  // Create new folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setIsCreatingFolder(true);

    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newFolderName.trim() }),
      });

      const data = await res.json();
      if (data.success && data.folder) {
        setFolders((prev) => {
          if (prev.some((f) => f.name === data.folder.name)) return prev;
          return [...prev, data.folder];
        });
        setDestinationFolder(data.folder.name);
        setSelectedFolderFilter(data.folder.name);
        setNewFolderName("");
        setShowCreateFolderModal(false);
        setPage(1);
      } else {
        alert(data.error || "Failed to create folder");
      }
    } catch (err) {
      console.error("Error creating folder:", err);
      alert("Failed to create folder");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Upload new file via XHR with Progress bar
  const handleUploadFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", destinationFolder);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload", true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percentComplete);
      }
    };

    xhr.onload = async () => {
      setIsUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        if (data.success && data.fileRecord) {
          await fetchMediaFilesAndFolders();
          handleToggleSelect(data.fileRecord);
        }
      } else {
        alert("Failed to upload file");
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      alert("Error uploading file");
    };

    xhr.send(formData);
  };

  const handleDone = () => {
    onSelect(selectedFiles);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 relative">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
            {paginationInfo.total > 0 && (
              <span className="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                {paginationInfo.total} items
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Search */}
        <div className="px-6 py-3 border-b border-gray-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter by Folder */}
            <select
              value={selectedFolderFilter}
              onChange={(e) => {
                setSelectedFolderFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-700 focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Folders</option>
              {folders.map((f) => (
                <option key={f.id} value={f.name}>
                  Folder: {f.label}
                </option>
              ))}
            </select>

            {/* Filter by Category */}
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-700 focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Categories</option>
              <option value="IMAGE">Images</option>
              <option value="FONT">Fonts</option>
              <option value="DOCUMENT">Documents</option>
            </select>

            {/* Add New Folder Button */}
            <button
              type="button"
              onClick={() => setShowCreateFolderModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:border-gray-400 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5 text-blue-600" />
              <span>+ New Folder</span>
            </button>
          </div>
        </div>

        {/* Upload Dropzone with Destination Folder Selector */}
        <div className="px-6 pt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              Upload Destination Folder:
            </span>
            <select
              value={destinationFolder}
              onChange={(e) => setDestinationFolder(e.target.value)}
              className="px-2.5 py-1 bg-white border border-gray-300 rounded-md text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
            >
              {folders.map((f) => (
                <option key={f.id} value={f.name}>
                  📁 {f.label} ({f.name})
                </option>
              ))}
            </select>
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) handleUploadFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition ${
              isDragging
                ? "border-blue-500 bg-blue-50/50"
                : "border-gray-300 bg-slate-50/40 hover:bg-slate-50 hover:border-gray-400"
            }`}
          >
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleUploadFiles(e.target.files);
              }}
            />
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Upload className="w-4 h-4 text-blue-600" />
              <span>Add new media or drag & drop files here into <strong>"{destinationFolder}"</strong></span>
            </div>
          </label>

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                <span>Uploading to R2...</span>
                <span>{uploadProgress}%</span>
              </div>
              <ProgressBar progress={uploadProgress} size="small" />
            </div>
          )}
        </div>

        {/* Media Grid List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-12 text-center text-xs text-gray-500">Loading files...</div>
          ) : files.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500 space-y-1">
              <ImageIcon className="w-8 h-8 mx-auto text-gray-300" />
              <p>No media files found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {files.map((file) => {
                const isSelected = selectedFiles.some((f) => f.id === file.id);
                return (
                  <div
                    key={file.id}
                    onClick={() => handleToggleSelect(file)}
                    className={`group relative bg-white border rounded-xl overflow-hidden cursor-pointer transition flex flex-col justify-between ${
                      isSelected
                        ? "ring-2 ring-blue-600 border-blue-600 bg-blue-50/10 shadow-md"
                        : "border-gray-200 hover:border-gray-300 hover:shadow-xs"
                    }`}
                  >
                    {/* Checkbox badge */}
                    <div
                      className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border flex items-center justify-center transition ${
                        isSelected
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white/90 border-gray-300 text-transparent group-hover:text-gray-300"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>

                    {/* Creator Avatar badge */}
                    <div
                      className="absolute top-2 right-2 z-10 rounded-full overflow-hidden"
                      title={`Uploaded by: ${file.createdByName || file.uploadedBy || "Super Admin"}`}
                    >
                      <img
                        src={
                          file.createdByAvatar ||
                          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                        }
                        alt={file.createdByName || "Uploader"}
                        className="w-5 h-5 rounded-full object-cover border border-white shadow-xs"
                      />
                    </div>

                    {/* Preview Thumbnail */}
                    <div className="relative aspect-square bg-slate-50 flex items-center justify-center p-2 border-b border-gray-100 overflow-hidden">
                      {file.category === "IMAGE" ? (
                        <img
                          src={file.thumbnailUrl || file.url}
                          alt={file.fileName}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "https://images.unsplash.com/photo-1544816155-12df9643f363?w=300&auto=format&fit=crop&q=60";
                          }}
                        />
                      ) : file.category === "FONT" ? (
                        <div className="flex flex-col items-center gap-1 text-indigo-600">
                          <Type className="w-8 h-8" />
                          <span className="text-[10px] font-bold uppercase">Font</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-emerald-600">
                          <FileText className="w-8 h-8" />
                          <span className="text-[10px] font-bold uppercase">Doc</span>
                        </div>
                      )}
                    </div>

                    {/* File Meta */}
                    <div className="p-2 space-y-0.5">
                      <p className="text-xs font-semibold text-slate-800 truncate" title={file.fileName}>
                        {file.fileName}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span className="uppercase">{file.fileType.split("/")[1] || "FILE"}</span>
                        <span className="bg-slate-100 px-1 py-0.2 rounded text-[9px] font-medium text-slate-600 border border-slate-200">
                          {file.folder}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with Pagination */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 bg-white">
          <div className="flex items-center gap-4">
            <span className="text-xs font-semibold text-slate-700">
              {selectedFiles.length} file(s) selected
            </span>

            {/* Pagination Controls */}
            {paginationInfo.totalPages > 1 && (
              <div className="flex items-center gap-2 border-l pl-4 border-gray-200">
                <button
                  type="button"
                  disabled={!paginationInfo.hasPrevPage}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 transition cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-slate-600">
                  Page {page} of {paginationInfo.totalPages}
                </span>
                <button
                  type="button"
                  disabled={!paginationInfo.hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 transition cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedFiles.length === 0}
              onClick={handleDone}
              className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition shadow-xs cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>

        {/* Inner Modal: Create New Folder */}
        {showCreateFolderModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 border border-gray-200 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <FolderPlus className="w-4 h-4 text-blue-600" />
                  Create New Folder
                </h4>
                <button
                  type="button"
                  onClick={() => setShowCreateFolderModal(false)}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Folder Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Clipart Packs, Banners, Backgrounds..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolder();
                  }}
                  autoFocus
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateFolderModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newFolderName.trim() || isCreatingFolder}
                  onClick={handleCreateFolder}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-2xs cursor-pointer"
                >
                  {isCreatingFolder ? "Creating..." : "Create Folder"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
