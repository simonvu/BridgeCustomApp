import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Button,
  InlineStack,
  BlockStack,
  Box,
  TextField,
  Select,
  Modal,
  FormLayout,
  Tabs,
  IndexTable,
  ProgressBar,
  Pagination,
  useIndexResourceState,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import {
  Upload,
  Search,
  Copy,
  Check,
  Trash2,
  FileText,
  Type,
  Image as ImageIcon,
  ExternalLink,
  LayoutGrid,
  List as ListIcon,
  Download,
  Info,
  Folder,
  AlertCircle,
  FolderPlus,
  X,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import prisma from "../db.server";
import { requireTeamUserId } from "../services/auth.server";

// Helper to format bytes to human readable string (KB / MB)
function formatBytes(bytes: number, decimals = 1) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

interface UploadProgressItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
}

// Loader: Fetch Media Files & Current User
export async function loader({ request }: LoaderFunctionArgs) {
  const currentUserId = await requireTeamUserId(request);
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    include: { userRoles: { include: { role: true } } },
  });

  const mediaModel = (prisma as any).mediaFile;
  const mediaFiles = mediaModel
    ? await mediaModel.findMany({
        orderBy: { createdAt: "desc" },
      })
    : [];

  return json({
    currentUser: {
      email: currentUser?.email || "admin@bridgecustom.com",
      name: currentUser?.name || "Super Admin",
      roleName: currentUser?.userRoles?.[0]?.role?.code?.toUpperCase() || "SUPER_ADMIN",
      avatarUrl: currentUser?.avatarUrl || null,
    },
    mediaFiles,
  });
}

// Action: Delete Files / Update Alt Text
export async function action({ request }: ActionFunctionArgs) {
  await requireTeamUserId(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const mediaModel = (prisma as any).mediaFile;
  if (!mediaModel) {
    return json({ error: "MediaFile database model not found" }, { status: 500 });
  }

  if (intent === "DELETE_MEDIA_FILE") {
    const fileId = formData.get("fileId") as string;
    if (fileId) {
      await mediaModel.delete({ where: { id: fileId } });
    }
    return json({ success: true });
  }

  if (intent === "BULK_DELETE_MEDIA_FILES") {
    const fileIdsStr = formData.get("fileIds") as string;
    if (fileIdsStr) {
      const fileIds = JSON.parse(fileIdsStr);
      await mediaModel.deleteMany({
        where: { id: { in: fileIds } },
      });
    }
    return json({ success: true });
  }

  if (intent === "UPDATE_ALT_TEXT") {
    const fileId = formData.get("fileId") as string;
    const altText = formData.get("altText") as string;
    if (fileId) {
      await mediaModel.update({
        where: { id: fileId },
        data: { altText },
      });
    }
    return json({ success: true });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function MediaRoute() {
  const { currentUser, mediaFiles } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const revalidator = useRevalidator();

  // Tab & View States
  const [selectedTab, setSelectedTab] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("ALL");
  const [sortOption, setSortOption] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Copy Feedback Toast
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Dynamic Folders State
  const [foldersList, setFoldersList] = useState<{ id: string; name: string; label: string }[]>([
    { id: "1", name: "general", label: "General" },
    { id: "2", name: "artworks", label: "Artworks" },
    { id: "3", name: "cliparts", label: "Cliparts" },
    { id: "4", name: "fonts", label: "Fonts" },
    { id: "5", name: "avatars", label: "Avatars" },
  ]);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      if (res.ok) {
        const data = await res.json();
        if (data.folders) setFoldersList(data.folders);
      }
    } catch (e) {
      console.error("Error fetching folders:", e);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

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
        setFoldersList((prev) => {
          if (prev.some((f) => f.name === data.folder.name)) return prev;
          return [...prev, data.folder];
        });
        setUploadFolder(data.folder.name);
        setSelectedFolder(data.folder.name);
        setNewFolderName("");
        setShowCreateFolderModal(false);
        await fetchFolders();
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

  // Upload Modal & Progress Bar Queue State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFolder, setUploadFolder] = useState("general");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadProgressItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // File Details Drawer/Modal State
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [fileAltText, setFileAltText] = useState("");

  const isSubmitting = navigation.state === "submitting";

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  // Real-time Byte Progress Upload via XMLHttpRequest
  const uploadSingleFileWithProgress = (file: File, folder: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const itemId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newItem: UploadProgressItem = {
        id: itemId,
        name: file.name,
        size: file.size,
        progress: 0,
        status: "uploading",
      };

      setUploadQueue((prev) => [newItem, ...prev]);

      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadQueue((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, progress: percent } : item))
          );
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              setUploadQueue((prev) =>
                prev.map((item) =>
                  item.id === itemId ? { ...item, progress: 100, status: "success" } : item
                )
              );
              resolve(response);
            } else {
              setUploadQueue((prev) =>
                prev.map((item) =>
                  item.id === itemId
                    ? { ...item, status: "error", error: response.error || "Upload failed" }
                    : item
                )
              );
              reject(new Error(response.error || "Upload failed"));
            }
          } catch (e: any) {
            reject(e);
          }
        } else {
          setUploadQueue((prev) =>
            prev.map((item) =>
              item.id === itemId ? { ...item, status: "error", error: `HTTP ${xhr.status}` } : item
            )
          );
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, status: "error", error: "Network error" } : item
          )
        );
        reject(new Error("Network error"));
      };

      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);

      xhr.open("POST", "/api/upload", true);
      xhr.send(formData);
    });
  };

  const processFilesUpload = async (filesList: FileList | File[]) => {
    if (!filesList || filesList.length === 0) return;

    setIsUploading(true);
    let successCount = 0;

    for (let i = 0; i < filesList.length; i++) {
      try {
        await uploadSingleFileWithProgress(filesList[i], uploadFolder);
        successCount++;
      } catch (err) {
        console.error("Upload error for file:", filesList[i].name, err);
      }
    }

    setIsUploading(false);
    if (successCount > 0) {
      revalidator.revalidate();
      setTimeout(() => {
        setUploadModalOpen(false);
      }, 1000);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFilesUpload(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFilesUpload(e.dataTransfer.files);
    }
  };

  const handleDeleteFile = (fileId: string) => {
    if (confirm("Are you sure you want to delete this media file?")) {
      submit({ intent: "DELETE_MEDIA_FILE", fileId }, { method: "post" });
      if (selectedFile?.id === fileId) {
        setSelectedFile(null);
      }
    }
  };

  const handleUpdateAltText = () => {
    if (selectedFile) {
      submit(
        { intent: "UPDATE_ALT_TEXT", fileId: selectedFile.id, altText: fileAltText },
        { method: "post" }
      );
      setSelectedFile((prev: any) => ({ ...prev, altText: fileAltText }));
    }
  };

  // Tabs filtering
  const tabs = [
    { id: "all", content: "All files", panelID: "all-files-panel" },
    { id: "images", content: "Images", panelID: "images-panel" },
    { id: "fonts", content: "Fonts", panelID: "fonts-panel" },
    { id: "documents", content: "Documents", panelID: "documents-panel" },
  ];

  // Filter & Sort Logic
  const filteredFiles = mediaFiles
    .filter((file) => {
      // Tab filter
      if (selectedTab === 1 && file.category !== "IMAGE") return false;
      if (selectedTab === 2 && file.category !== "FONT") return false;
      if (selectedTab === 3 && file.category !== "DOCUMENT") return false;

      // Folder filter
      if (selectedFolder !== "ALL" && file.folder !== selectedFolder) return false;

      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          file.fileName.toLowerCase().includes(query) ||
          (file.altText && file.altText.toLowerCase().includes(query)) ||
          file.category.toLowerCase().includes(query) ||
          file.folder.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortOption === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortOption === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortOption === "size") return b.fileSize - a.fileSize;
      if (sortOption === "name") return a.fileName.localeCompare(b.fileName);
      return 0;
    });

  // Pagination Math
  const totalFilteredCount = filteredFiles.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const paginatedFiles = filteredFiles.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // IndexTable Resource State for Bulk Actions
  const resourceName = {
    singular: "file",
    plural: "files",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(paginatedFiles);

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedResources.length} selected files?`)) {
      submit(
        { intent: "BULK_DELETE_MEDIA_FILES", fileIds: JSON.stringify(selectedResources) },
        { method: "post" }
      );
      clearSelection();
    }
  };

  const bulkActions = [
    {
      content: "Delete files",
      destructive: true,
      onAction: handleBulkDelete,
    },
    {
      content: "Copy links",
      onAction: () => {
        const selectedFilesList = filteredFiles.filter((f) => selectedResources.includes(f.id));
        const urls = selectedFilesList.map((f) => f.url).join("\n");
        navigator.clipboard.writeText(urls);
        alert(`Copied ${selectedFilesList.length} file URLs to clipboard!`);
      },
    },
  ];

  return (
    <DashboardLayout currentUser={currentUser}>
      <Page
        fullWidth
        title="Media"
        subtitle="Upload, store, and manage all images, fonts, vectors, and media assets in Cloudflare R2"
        primaryAction={{
          content: "Upload files",
          onAction: () => {
            setUploadQueue([]);
            setUploadModalOpen(true);
          },
        }}
      >
        <div className="pt-4 space-y-4">
          <Card padding="0">
            {/* Tabs Filter Bar */}
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              <Box padding="400">
                <BlockStack gap="400">
                  {/* Search, Folder Filter, Sort & View Mode Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 flex-1 max-w-2xl">
                      <div className="flex-1 min-w-[240px]">
                        <TextField
                          label="Search files"
                          labelHidden
                          placeholder="Search files by name, folder, or alt text..."
                          value={searchQuery}
                          onChange={setSearchQuery}
                          autoComplete="off"
                        />
                      </div>
                      <div className="w-40">
                        <Select
                          label="Folder"
                          labelHidden
                          options={[
                            { label: "All Folders", value: "ALL" },
                            ...foldersList.map((f) => ({ label: f.label, value: f.name })),
                          ]}
                          value={selectedFolder}
                          onChange={setSelectedFolder}
                        />
                      </div>
                      <div className="w-48">
                        <Select
                          label="Sort by"
                          labelHidden
                          options={[
                            { label: "Date (newest first)", value: "newest" },
                            { label: "Date (oldest first)", value: "oldest" },
                            { label: "Size (largest first)", value: "size" },
                            { label: "File Name (A-Z)", value: "name" },
                          ]}
                          value={sortOption}
                          onChange={setSortOption}
                        />
                      </div>
                    </div>

                    {/* View Mode Switcher (List vs Grid) */}
                    <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
                      <button
                        type="button"
                        onClick={() => setViewMode("list")}
                        className={`p-1.5 rounded-md transition cursor-pointer ${
                          viewMode === "list"
                            ? "bg-white text-[#005bd3] shadow-xs font-bold"
                            : "text-gray-500 hover:text-gray-800"
                        }`}
                        title="List View"
                      >
                        <ListIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("grid")}
                        className={`p-1.5 rounded-md transition cursor-pointer ${
                          viewMode === "grid"
                            ? "bg-white text-[#005bd3] shadow-xs font-bold"
                            : "text-[#616161] hover:text-[#1a1a1a]"
                        }`}
                        title="Grid Card View"
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Empty State */}
                  {filteredFiles.length === 0 ? (
                    <div className="py-16 text-center text-gray-500 space-y-2">
                      <ImageIcon className="w-10 h-10 mx-auto text-gray-300" />
                      <p className="text-sm font-semibold text-gray-700">No media files found</p>
                      <p className="text-xs text-gray-500">
                        Try adjusting your filters or click "Upload files" to add media to your library.
                      </p>
                    </div>
                  ) : viewMode === "list" ? (
                    /* Shopify Polaris Style IndexTable List View */
                    <IndexTable
                      resourceName={resourceName}
                      itemCount={paginatedFiles.length}
                      selectedItemsCount={
                        allResourcesSelected ? "All" : selectedResources.length
                      }
                      onSelectionChange={handleSelectionChange}
                      bulkActions={bulkActions}
                      headings={[
                        { title: "File" },
                        { title: "Folder" },
                        { title: "Size" },
                        { title: "Uploaded By" },
                        { title: "Uploaded Date" },
                        { title: "Actions", alignment: "end" },
                      ]}
                    >
                      {paginatedFiles.map((file, index) => (
                        <IndexTable.Row
                          id={file.id}
                          key={file.id}
                          selected={selectedResources.includes(file.id)}
                          position={index}
                        >
                          <IndexTable.Cell>
                            <div className="flex items-center gap-3 py-1">
                              {/* File Thumbnail Preview */}
                              <div
                                onClick={() => {
                                  setSelectedFile(file);
                                  setFileAltText(file.altText || "");
                                }}
                                className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer hover:opacity-80 transition"
                              >
                                {file.category === "IMAGE" ? (
                                  <img
                                    src={file.thumbnailUrl || file.url}
                                    alt={file.fileName}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src =
                                        "https://images.unsplash.com/photo-1544816155-12df9643f363?w=100&auto=format&fit=crop&q=60";
                                    }}
                                  />
                                ) : file.category === "FONT" ? (
                                  <Type className="w-5 h-5 text-indigo-600" />
                                ) : (
                                  <FileText className="w-5 h-5 text-emerald-600" />
                                )}
                              </div>

                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFile(file);
                                    setFileAltText(file.altText || "");
                                  }}
                                  className="text-xs font-bold text-[#303030] hover:text-[#005bd3] truncate block text-left transition cursor-pointer"
                                >
                                  {file.fileName}
                                </button>
                                <span className="text-[11px] text-gray-500 block truncate">
                                  {file.fileType}
                                </span>
                              </div>
                            </div>
                          </IndexTable.Cell>

                          <IndexTable.Cell>
                            <span className="inline-block text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium border border-gray-200">
                              {file.folder}
                            </span>
                          </IndexTable.Cell>

                          <IndexTable.Cell>
                            <span className="text-xs text-gray-700 font-medium">
                              {formatBytes(file.fileSize)}
                            </span>
                          </IndexTable.Cell>

                          <IndexTable.Cell>
                            <div
                              className="flex items-center gap-1.5 cursor-pointer"
                              title={`Uploaded by: ${file.createdByName || file.uploadedBy || "Super Admin"}`}
                            >
                              <img
                                src={
                                  file.createdByAvatar ||
                                  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                                }
                                alt={file.createdByName || "Uploader"}
                                className="w-5 h-5 rounded-full object-cover ring-1 ring-gray-200"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";
                                }}
                              />
                              <span className="text-xs text-gray-700 font-medium truncate max-w-[120px]">
                                {file.createdByName || file.uploadedBy || "Super Admin"}
                              </span>
                            </div>
                          </IndexTable.Cell>

                          <IndexTable.Cell>
                            <span className="text-xs text-gray-500">
                              {new Date(file.createdAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </IndexTable.Cell>

                          <IndexTable.Cell>
                            <div className="flex items-center justify-end gap-1.5">
                              {/* 1-Click Copy Link Button */}
                              <button
                                type="button"
                                onClick={() => handleCopyUrl(file.url)}
                                title="Copy link to clipboard"
                                className="p-1.5 text-gray-500 hover:text-[#005bd3] hover:bg-blue-50 rounded-md transition cursor-pointer"
                              >
                                {copiedUrl === file.url ? (
                                  <Check className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>

                              <a
                                href={file.url}
                                target="_blank"
                                rel="noreferrer"
                                title="Open file in new tab"
                                className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>

                              <button
                                type="button"
                                onClick={() => handleDeleteFile(file.id)}
                                title="Delete file"
                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      ))}
                    </IndexTable>
                  ) : (
                    /* Grid / Media Cards View */
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {paginatedFiles.map((file) => (
                        <div
                          key={file.id}
                          className="group bg-white border border-gray-200 rounded-xl overflow-hidden shadow-2xs hover:shadow-md transition flex flex-col justify-between"
                        >
                          <div
                            onClick={() => {
                              setSelectedFile(file);
                              setFileAltText(file.altText || "");
                            }}
                            className="relative aspect-square bg-gray-50 flex items-center justify-center p-3 border-b border-gray-100 cursor-pointer overflow-hidden"
                          >
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

                            {/* Creator Avatar Badge with Tooltip showing Creator Name */}
                            <div
                              className="absolute top-2 right-2 shadow-xs rounded-full overflow-hidden"
                              title={`Uploaded by: ${file.createdByName || file.uploadedBy || "Super Admin"}`}
                            >
                              <img
                                src={
                                  file.createdByAvatar ||
                                  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                                }
                                alt={file.createdByName || "Uploader"}
                                className="w-5 h-5 rounded-full object-cover border border-white shadow-xs"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";
                                }}
                              />
                            </div>
                          </div>

                          <div className="p-2.5 space-y-1.5">
                            <h4
                              className="text-xs font-bold text-[#303030] truncate hover:text-[#005bd3] cursor-pointer"
                              title={file.fileName}
                              onClick={() => {
                                setSelectedFile(file);
                                setFileAltText(file.altText || "");
                              }}
                            >
                              {file.fileName}
                            </h4>

                            <div className="flex items-center justify-between text-[11px] text-gray-500">
                              <span>{formatBytes(file.fileSize)}</span>
                              <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] uppercase border border-gray-200">
                                {file.folder}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-xs">
                              <button
                                type="button"
                                onClick={() => handleCopyUrl(file.url)}
                                className="flex items-center gap-1 text-gray-600 hover:text-[#005bd3] font-medium text-[11px] transition cursor-pointer"
                              >
                                {copiedUrl === file.url ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span className="text-emerald-600 font-bold">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy URL</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteFile(file.id)}
                                className="text-gray-400 hover:text-red-600 p-1 transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Polaris Pagination Bar */}
                  {totalFilteredCount > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-200 bg-white">
                      <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                        <span>
                          Showing {(currentPage - 1) * pageSize + 1} -{" "}
                          {Math.min(currentPage * pageSize, totalFilteredCount)} of {totalFilteredCount} items
                        </span>
                        <span className="text-gray-300">|</span>
                        <div className="flex items-center gap-1">
                          <span>Rows per page:</span>
                          <select
                            value={pageSize}
                            onChange={(e) => {
                              setPageSize(Number(e.target.value));
                              setCurrentPage(1);
                            }}
                            className="px-2 py-1 border border-gray-300 rounded bg-white text-xs text-gray-700 focus:ring-2 focus:ring-blue-500"
                          >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                      </div>

                      <Pagination
                        hasPrevious={currentPage > 1}
                        onPrevious={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        hasNext={currentPage < totalPages}
                        onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        label={`Page ${currentPage} of ${totalPages}`}
                      />
                    </div>
                  )}
                </BlockStack>
              </Box>
            </Tabs>
          </Card>
        </div>

        {/* Upload Files Modal with 100% Clickable & Drag-and-Drop DropZone */}
        <Modal
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          title="Upload Files to Media Library"
          primaryAction={{
            content: isUploading ? "Uploading..." : "Done",
            onAction: () => setUploadModalOpen(false),
            disabled: isUploading,
          }}
        >
          <Modal.Section>
            <FormLayout>
              <div className="space-y-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    Destination Folder
                  </label>
                  {!showCreateFolderModal && (
                    <button
                      type="button"
                      onClick={() => setShowCreateFolderModal(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      + Add New Folder
                    </button>
                  )}
                </div>

                {showCreateFolderModal ? (
                  <div className="flex items-center gap-2 p-2 bg-white border border-blue-400 rounded-lg shadow-xs">
                    <input
                      type="text"
                      placeholder="Folder name (e.g. Banners, Cliparts)..."
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateFolder();
                      }}
                      autoFocus
                      className="flex-1 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={!newFolderName.trim() || isCreatingFolder}
                      onClick={handleCreateFolder}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md shadow-2xs cursor-pointer"
                    >
                      {isCreatingFolder ? "Creating..." : "Save Folder"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateFolderModal(false);
                        setNewFolderName("");
                      }}
                      className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <Select
                    label="Destination Folder"
                    labelHidden
                    options={foldersList.map((f) => ({ label: `📁 ${f.label} (${f.name})`, value: f.name }))}
                    value={uploadFolder}
                    onChange={setUploadFolder}
                    disabled={isUploading}
                  />
                )}
              </div>

              {/* 100% Clickable & Drag-and-Drop Drop Zone Label Box */}
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`block p-8 border-2 border-dashed rounded-xl text-center space-y-3 cursor-pointer transition ${
                  isDragOver
                    ? "border-[#005bd3] bg-blue-50/80 ring-2 ring-blue-400/50"
                    : "border-gray-300 hover:border-[#005bd3] bg-gray-50 hover:bg-blue-50/40"
                }`}
              >
                <Upload className="w-10 h-10 text-[#005bd3] mx-auto" />
                <div>
                  <p className="text-xs font-bold text-gray-800">
                    {isUploading
                      ? "Uploading files to Cloudflare R2 / Storage..."
                      : "Click anywhere or drag & drop files here to upload"}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Supports PNG, JPG, GIF, WEBP, SVG, TTF, OTF, WOFF2, PDF up to 25MB each
                  </p>
                </div>
                <div>
                  <span className="inline-block bg-[#005bd3] hover:bg-[#004bb4] text-white text-xs font-bold px-4 py-2 rounded-lg shadow-2xs transition">
                    {isUploading ? "Uploading..." : "Browse Files"}
                  </span>
                </div>
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>

              {/* Real-time Progress Bar Queue List */}
              {uploadQueue.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-[#303030]">Upload Queue Progress</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {uploadQueue.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white border border-gray-200 p-3 rounded-lg space-y-1.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[#303030] truncate max-w-[70%]" title={item.name}>
                            {item.name} ({formatBytes(item.size)})
                          </span>
                          <span className="font-bold text-[11px]">
                            {item.status === "uploading" && (
                              <span className="text-[#005bd3]">{item.progress}%</span>
                            )}
                            {item.status === "success" && (
                              <span className="text-emerald-600 flex items-center gap-1 font-bold">
                                <Check className="w-3.5 h-3.5" /> 100% Completed
                              </span>
                            )}
                            {item.status === "error" && (
                              <span className="text-red-600 flex items-center gap-1 font-bold">
                                <AlertCircle className="w-3.5 h-3.5" /> {item.error || "Failed"}
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Real-time Animated Progress Bar */}
                        <ProgressBar
                          progress={item.progress}
                          size="small"
                          animated={item.status === "uploading"}
                          tone={item.status === "error" ? "critical" : item.status === "success" ? "success" : "highlight"}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* File Detail Modal / Drawer */}
        {selectedFile && (
          <Modal
            open={Boolean(selectedFile)}
            onClose={() => setSelectedFile(null)}
            title="File Details"
            primaryAction={{
              content: "Save Alt Text",
              onAction: handleUpdateAltText,
              loading: isSubmitting,
            }}
            secondaryActions={[
              {
                content: "Close",
                onAction: () => setSelectedFile(null),
              },
            ]}
          >
            <Modal.Section>
              <div className="space-y-4">
                {/* Media Preview Box */}
                <div className="w-full aspect-video bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center p-4 overflow-hidden">
                  {selectedFile.category === "IMAGE" ? (
                    <img
                      src={selectedFile.url}
                      alt={selectedFile.fileName}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : selectedFile.category === "FONT" ? (
                    <div className="text-center space-y-2 text-indigo-700">
                      <Type className="w-12 h-12 mx-auto" />
                      <p className="text-sm font-bold">{selectedFile.fileName}</p>
                      <p className="text-xs text-gray-500">Custom Typography Font Asset</p>
                    </div>
                  ) : (
                    <div className="text-center space-y-2 text-emerald-700">
                      <FileText className="w-12 h-12 mx-auto" />
                      <p className="text-sm font-bold">{selectedFile.fileName}</p>
                    </div>
                  )}
                </div>

                {/* File Metadata Details Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <div>
                    <span className="text-gray-500 block">File name:</span>
                    <span className="font-bold text-gray-800 break-all">{selectedFile.fileName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">File size:</span>
                    <span className="font-semibold text-gray-800">{formatBytes(selectedFile.fileSize)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Mimetype:</span>
                    <span className="font-semibold text-gray-800">{selectedFile.fileType}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Folder:</span>
                    <span className="font-semibold text-gray-800 uppercase">{selectedFile.folder}</span>
                  </div>
                </div>

                {/* Direct Link Field with 1-Click Copy */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700">Direct Cloudflare R2 Link</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={selectedFile.url}
                      className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-800 focus:outline-none"
                    />
                    <Button
                      size="slim"
                      onClick={() => handleCopyUrl(selectedFile.url)}
                    >
                      {copiedUrl === selectedFile.url ? "Copied!" : "Copy Link"}
                    </Button>
                  </div>
                </div>

                {/* Alt Text Field */}
                <TextField
                  label="Alt text (Image description for SEO & Accessibility)"
                  value={fileAltText}
                  onChange={setFileAltText}
                  placeholder="Describe this image for search engines..."
                  autoComplete="off"
                />
              </div>
            </Modal.Section>
          </Modal>
        )}
      </Page>
    </DashboardLayout>
  );
}
