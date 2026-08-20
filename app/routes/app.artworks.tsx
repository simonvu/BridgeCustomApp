import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
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
  Checkbox,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import {
  Plus,
  Search,
  Layers,
  Grid,
  Calendar,
  Copy,
  Pencil,
  Trash2,
  Lock,
  CheckCircle2,
  Combine,
  Upload,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import MediaSelectModal, { type MediaFileItem } from "../components/MediaSelectModal";
import prisma from "../db.server";
import { requireTeamUserId } from "../services/auth.server";

// Loader: Fetch Artworks & User Profile
export async function loader({ request }: LoaderFunctionArgs) {
  const currentUserId = await requireTeamUserId(request);
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    include: { userRoles: { include: { role: true } } },
  });

  const artworkModel = (prisma as any).artwork;
  const artworks = artworkModel
    ? await artworkModel.findMany({
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
    artworks,
  });
}

// Action: Create / Delete / Duplicate Artwork
export async function action({ request }: ActionFunctionArgs) {
  const currentUserId = await requireTeamUserId(request);
  const currentUser = await prisma.user.findUnique({ where: { id: currentUserId } });

  const uploaderEmail = currentUser?.email || "admin@bridgecustom.com";
  const uploaderName = currentUser?.name || "Super Admin";
  const uploaderAvatar = currentUser?.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";

  const formData = await request.formData();
  const intent = formData.get("intent");

  const artworkModel = (prisma as any).artwork;

  if (intent === "CREATE_ARTWORK") {
    const title = formData.get("title") as string;
    const niche = (formData.get("niche") as string) || "General";
    const category = (formData.get("category") as string) || "General";
    const dimensions = (formData.get("dimensions") as string) || "1000x1000";
    const imageUrl = (formData.get("imageUrl") as string) || "";
    const layerCount = parseInt((formData.get("layerCount") as string) || "1", 10);
    const optionCount = parseInt((formData.get("optionCount") as string) || "1", 10);

    if (!title || !imageUrl) {
      return json({ error: "Title and Image URL are required" }, { status: 400 });
    }

    if (artworkModel) {
      await artworkModel.create({
        data: {
          title,
          niche,
          category,
          dimensions,
          imageUrl,
          layerCount,
          optionCount,
          createdBy: uploaderEmail,
          createdByName: uploaderName,
          createdByAvatar: uploaderAvatar,
        },
      });
    }

    return json({ success: true });
  }

  if (intent === "DELETE_ARTWORK") {
    const artworkId = formData.get("artworkId") as string;
    if (artworkId && artworkModel) {
      await artworkModel.delete({ where: { id: artworkId } });
    }
    return json({ success: true });
  }

  if (intent === "DUPLICATE_ARTWORK") {
    const artworkId = formData.get("artworkId") as string;
    if (artworkId && artworkModel) {
      const artwork = await artworkModel.findUnique({ where: { id: artworkId } });
      if (artwork) {
        await artworkModel.create({
          data: {
            title: `${artwork.title} (Copy)`,
            niche: artwork.niche,
            category: artwork.category,
            dimensions: artwork.dimensions,
            imageUrl: artwork.imageUrl,
            layerCount: artwork.layerCount,
            optionCount: artwork.optionCount,
            createdBy: uploaderEmail,
            createdByName: uploaderName,
            createdByAvatar: uploaderAvatar,
          },
        });
      }
    }
    return json({ success: true });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function ArtworksRoute() {
  const { currentUser, artworks } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNiche, setSelectedNiche] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedCreatedBy, setSelectedCreatedBy] = useState("ALL");

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [niche, setNiche] = useState("Quotes");
  const [category, setCategory] = useState("Best Friends");
  const [dimensions, setDimensions] = useState("400x400");
  const [imageUrl, setImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const isSubmitting = navigation.state === "submitting";

  const handleMediaSelect = (selectedFiles: MediaFileItem[]) => {
    if (selectedFiles.length > 0) {
      setImageUrl(selectedFiles[0].url);
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "artworks");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success && data.url) {
        setImageUrl(data.url);
      } else {
        alert(data.error || "Failed to upload artwork image");
      }
    } catch (error) {
      console.error("Upload artwork error:", error);
      alert("Error uploading image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateArtwork = () => {
    const formData = new FormData();
    formData.append("intent", "CREATE_ARTWORK");
    formData.append("title", title);
    formData.append("niche", niche);
    formData.append("category", category);
    formData.append("dimensions", dimensions);
    formData.append("imageUrl", imageUrl);

    submit(formData, { method: "post" });
    setCreateModalOpen(false);
    setTitle("");
    setImageUrl("");
  };

  const handleDelete = (artworkId: string) => {
    if (confirm("Are you sure you want to delete this artwork?")) {
      submit({ intent: "DELETE_ARTWORK", artworkId }, { method: "post" });
    }
  };

  const handleDuplicate = (artworkId: string) => {
    submit({ intent: "DUPLICATE_ARTWORK", artworkId }, { method: "post" });
  };

  const toggleSelectCard = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Filter artworks
  const filteredArtworks = artworks.filter((art) => {
    const matchesSearch =
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.niche.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesNiche = selectedNiche === "ALL" || art.niche === selectedNiche;
    const matchesCategory = selectedCategory === "ALL" || art.category === selectedCategory;
    const matchesCreatedBy = selectedCreatedBy === "ALL" || art.createdBy === selectedCreatedBy;

    return matchesSearch && matchesNiche && matchesCategory && matchesCreatedBy;
  });

  const nicheOptions = [
    { label: "Niche (All)", value: "ALL" },
    { label: "Tumblers", value: "Tumblers" },
    { label: "Mugs", value: "Mugs" },
    { label: "T-Shirts", value: "T-Shirts" },
    { label: "Quotes", value: "Quotes" },
    { label: "Canvas", value: "Canvas" },
    { label: "Pets", value: "Pets" },
  ];

  const categoryOptions = [
    { label: "Category (All)", value: "ALL" },
    { label: "Best Friends", value: "Best Friends" },
    { label: "Sisters and Friends", value: "Sisters and Friends" },
    { label: "Family & Kids", value: "Family & Kids" },
    { label: "Pet Lovers", value: "Pet Lovers" },
    { label: "Quotes", value: "Quotes" },
  ];

  const createdByOptions = [
    { label: "Created by (All)", value: "ALL" },
    { label: "Admin", value: "Admin" },
    { label: "Designer", value: "Designer" },
  ];

  return (
    <DashboardLayout currentUser={currentUser}>
      <Page
        fullWidth
        title="Artworks"
        subtitle="Manage personalization design assets, vector layers, and quote templates"
        primaryAction={{
          content: "Add New",
          onAction: () => setCreateModalOpen(true),
        }}
      >
        <div className="pt-5">
          <Layout>
            <Layout.Section>
              <Card padding="400">
              <BlockStack gap="400">
                {/* Search & Dropdown Filters Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="md:col-span-2">
                    <TextField
                      label="Search Assets"
                      labelHidden
                      placeholder="Search Assets by title or category..."
                      value={searchQuery}
                      onChange={setSearchQuery}
                      autoComplete="off"
                    />
                  </div>
                  <Select
                    label="Niche"
                    labelHidden
                    options={nicheOptions}
                    value={selectedNiche}
                    onChange={setSelectedNiche}
                  />
                  <Select
                    label="Category"
                    labelHidden
                    options={categoryOptions}
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                  />
                  <Select
                    label="Created by"
                    labelHidden
                    options={createdByOptions}
                    value={selectedCreatedBy}
                    onChange={setSelectedCreatedBy}
                  />
                </div>

                {/* Pagination Summary & Action Status Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-[#616161]">
                  <div>
                    Showing <span className="font-bold text-[#303030]">1 - {filteredArtworks.length}</span> of{" "}
                    <span className="font-bold text-[#303030]">{artworks.length}</span> items
                    {selectedIds.length > 0 && (
                      <span className="ml-2 font-bold text-blue-600">
                        ({selectedIds.length} items selected)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs">Page 1 of 1</span>
                    <Button size="micro" disabled>
                      Previous
                    </Button>
                    <Button size="micro" disabled>
                      Next
                    </Button>
                  </div>
                </div>

                {/* Grid Card View Layout */}
                {filteredArtworks.length === 0 ? (
                  <div className="py-12 text-center text-gray-500">
                    <p className="text-sm font-semibold">No artworks found matching your filter criteria.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pt-2">
                    {filteredArtworks.map((art) => {
                      const isSelected = selectedIds.includes(art.id);
                      return (
                        <div
                          key={art.id}
                          className={`group relative bg-white border rounded-xl overflow-hidden transition-all duration-200 hover:shadow-md flex flex-col justify-between ${
                            isSelected ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200/90"
                          }`}
                        >
                          {/* Top Right Checkbox Overlay */}
                          <div className="absolute top-2 right-2 z-10">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectCard(art.id)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer shadow-xs"
                            />
                          </div>

                          {/* Image Preview Thumbnail */}
                          <div className="relative w-full aspect-square bg-[#f8f9fa] flex items-center justify-center p-3 border-b border-gray-100 overflow-hidden">
                            <img
                              src={art.imageUrl}
                              alt={art.title}
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  "https://images.unsplash.com/photo-1544816155-12df9643f363?w=500&auto=format&fit=crop&q=60";
                              }}
                            />
                          </div>

                          {/* Bottom Info Section */}
                          <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                            <div>
                              <h3
                                className="text-xs font-bold text-[#303030] truncate group-hover:text-blue-600 transition"
                                title={art.title}
                              >
                                {art.title}
                              </h3>
                              <p className="text-[11px] text-[#616161] truncate mt-0.5">
                                {art.category} • {art.niche}
                              </p>
                            </div>

                            {/* Dimensions & Metadata Badge Row */}
                            <div className="space-y-1.5 pt-1 border-t border-gray-100/80">
                              <div className="flex items-center justify-between text-[11px] text-[#616161]">
                                <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                  {art.dimensions}
                                </span>
                                <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <Lock className="w-3 h-3 text-slate-400" />
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-[#616161]">
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center gap-0.5" title="Layer count">
                                    <Layers className="w-3 h-3 text-slate-500" />
                                    <span>{art.layerCount}</span>
                                  </span>
                                  <span className="flex items-center gap-0.5" title="Option count">
                                    <Grid className="w-3 h-3 text-slate-500" />
                                    <span>{art.optionCount}</span>
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {/* Creator Avatar with Tooltip showing Creator Name */}
                                  <div
                                    title={`Created by: ${art.createdByName || art.createdBy || "Super Admin"}`}
                                    className="flex items-center justify-center shrink-0 cursor-pointer"
                                  >
                                    <img
                                      src={
                                        art.createdByAvatar ||
                                        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                                      }
                                      alt={art.createdByName || "Creator"}
                                      className="w-4.5 h-4.5 rounded-full object-cover ring-1 ring-gray-300 hover:ring-blue-500 transition"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src =
                                          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80";
                                      }}
                                    />
                                  </div>

                                  <span className="text-[10px] text-slate-400">
                                    {new Date(art.createdAt).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Hover Actions Row */}
                            <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-gray-100">
                              <button
                                type="button"
                                onClick={() => handleDuplicate(art.id)}
                                title="Duplicate artwork"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => alert(`Edit artwork: ${art.title}`)}
                                title="Edit artwork"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(art.id)}
                                title="Delete artwork"
                                className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </div>

        {/* Modal Create / Upload New Artwork */}
        <Modal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Create New Artwork"
          primaryAction={{
            content: "Save Artwork",
            onAction: handleCreateArtwork,
            loading: isSubmitting || isUploading,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setCreateModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Artwork Title"
                value={title}
                onChange={setTitle}
                placeholder="e.g. Friend Quote Tumbler"
                autoComplete="off"
              />

              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Niche"
                  options={nicheOptions.filter((o) => o.value !== "ALL")}
                  value={niche}
                  onChange={setNiche}
                />
                <Select
                  label="Category"
                  options={categoryOptions.filter((o) => o.value !== "ALL")}
                  value={category}
                  onChange={setCategory}
                />
              </div>

              <TextField
                label="Dimensions (Pixels)"
                value={dimensions}
                onChange={setDimensions}
                placeholder="e.g. 400x400 or 1000x1000"
                autoComplete="off"
              />

              {/* Artwork Image Upload / Select from Media Library */}
              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <label className="block text-xs font-semibold text-slate-700">
                  Artwork Image File
                </label>

                {imageUrl ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={imageUrl}
                      alt="Artwork Preview"
                      className="w-16 h-16 object-contain rounded border border-slate-300 bg-white"
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setMediaPickerOpen(true)}
                        className="text-xs text-blue-600 hover:underline font-medium text-left"
                      >
                        Change Image
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageUrl("")}
                        className="text-xs text-red-600 hover:underline font-medium text-left"
                      >
                        Remove Image
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMediaPickerOpen(true)}
                    className="w-full flex items-center justify-center gap-2 p-4 bg-white border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-lg transition text-slate-700 hover:text-blue-600 cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-semibold">
                      Select image from Media Library
                    </span>
                  </button>
                )}
              </div>
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Shopify-style Reusable Media Select Modal */}
        <MediaSelectModal
          isOpen={mediaPickerOpen}
          onClose={() => setMediaPickerOpen(false)}
          onSelect={handleMediaSelect}
          allowedCategory="IMAGE"
          initialSelectedUrl={imageUrl}
          title="Select Artwork Image"
        />
      </Page>
    </DashboardLayout>
  );
}
