import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { Page, Layout, Card, TextField, Select } from "@shopify/polaris";
import { Layers, Copy, Pencil, Trash2, Package, Search } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import prisma from "../db.server";
import { requireTeamUserId } from "../services/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUserId = await requireTeamUserId(request);
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    include: { userRoles: { include: { role: true } } },
  });

  const model = (prisma as any).clipArt;
  const cliparts = model ? await model.findMany({ orderBy: { updatedAt: "desc" } }) : [];

  return json({
    currentUser: {
      email: currentUser?.email || "admin@bridgecustom.com",
      name: currentUser?.name || "Super Admin",
      roleName: currentUser?.userRoles?.[0]?.role?.code?.toUpperCase() || "SUPER_ADMIN",
      avatarUrl: currentUser?.avatarUrl || null,
    },
    cliparts,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireTeamUserId(request);
  const model = (prisma as any).clipArt;
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = formData.get("id") as string;

  if (intent === "DELETE" && id && model) {
    await model.deleteMany({ where: { id } });
    return json({ success: true });
  }
  if (intent === "DUPLICATE" && id && model) {
    const src = await model.findUnique({ where: { id } });
    if (src) {
      const { id: _o, createdAt: _c, updatedAt: _u, ...rest } = src as any;
      await model.create({ data: { ...rest, name: `${src.name} (Copy)` } });
    }
    return json({ success: true });
  }
  return json({ error: "Invalid action" }, { status: 400 });
}

export default function ClipArtsRoute() {
  const { currentUser, cliparts } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");

  const categories = Array.from(new Set(cliparts.map((c: any) => c.category).filter(Boolean))).sort() as string[];
  const categoryOptions = [{ label: "All categories", value: "ALL" }, ...categories.map((c) => ({ label: c, value: c }))];

  const filtered = cliparts.filter((c: any) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.tags || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.category || "").toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "ALL" || c.category === category;
    return matchSearch && matchCat;
  });

  const handleDelete = (id: string) => {
    if (confirm("Delete this clip art?")) submit({ intent: "DELETE", id }, { method: "post" });
  };
  const handleDuplicate = (id: string) => submit({ intent: "DUPLICATE", id }, { method: "post" });

  return (
    <DashboardLayout currentUser={currentUser}>
      <Page
        fullWidth
        title="Clip Art Library"
        subtitle="Build reusable layer-based objects and use them inside artworks"
        primaryAction={{
          content: "New Clip Art",
          onAction: () => navigate("/app/cliparts/studio"),
        }}
      >
        <div className="pt-5">
          <Layout>
            <Layout.Section>
              <Card padding="400">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="sm:col-span-2 relative">
                    <TextField
                      label="Search"
                      labelHidden
                      value={search}
                      onChange={setSearch}
                      placeholder="Search clip art by name, tag or category..."
                      autoComplete="off"
                      prefix={<Search className="w-4 h-4 text-slate-400" />}
                    />
                  </div>
                  <Select label="Category" labelHidden options={categoryOptions} value={category} onChange={setCategory} />
                </div>

                <div className="flex items-center justify-between text-xs text-[#616161] border-t border-gray-100 pt-3 mb-2">
                  <span>
                    Showing <span className="font-bold text-[#303030]">{filtered.length}</span> of{" "}
                    <span className="font-bold text-[#303030]">{cliparts.length}</span> clip art
                  </span>
                  {navigation.state !== "idle" && <span className="text-blue-600">Updating…</span>}
                </div>

                {filtered.length === 0 ? (
                  <div className="py-16 text-center text-slate-500 space-y-2">
                    <Package className="w-10 h-10 mx-auto text-slate-300" />
                    <p className="text-sm font-semibold">No clip art yet</p>
                    <p className="text-xs">Click “New Clip Art” to assemble layers into a reusable object.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pt-2">
                    {filtered.map((art: any) => (
                      <div
                        key={art.id}
                        className="group relative bg-white border border-gray-200/90 rounded-xl overflow-hidden hover:shadow-md transition flex flex-col"
                      >
                        <button
                          type="button"
                          onClick={() => navigate(`/app/cliparts/studio?id=${art.id}`)}
                          className="relative w-full aspect-square bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:20px_20px] flex items-center justify-center p-3 border-b border-gray-100 overflow-hidden cursor-pointer"
                          title="Open in Clip Art Builder"
                        >
                          {art.thumbnailUrl || art.compositeUrl ? (
                            <img
                              src={art.thumbnailUrl || art.compositeUrl}
                              alt={art.name}
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <Layers className="w-8 h-8 text-slate-300" />
                          )}
                        </button>

                        <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="text-xs font-bold text-[#303030] truncate" title={art.name}>
                              {art.name}
                            </h3>
                            <p className="text-[11px] text-[#616161] truncate">{art.category}</p>
                          </div>
                          <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
                            <span className="flex items-center gap-1 text-[11px] text-slate-500" title="Layer count">
                              <Layers className="w-3 h-3" />
                              {art.layerCount}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => navigate(`/app/cliparts/studio?id=${art.id}`)}
                                title="Edit"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicate(art.id)}
                                title="Duplicate"
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(art.id)}
                                title="Delete"
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </Layout.Section>
          </Layout>
        </div>
      </Page>
    </DashboardLayout>
  );
}
