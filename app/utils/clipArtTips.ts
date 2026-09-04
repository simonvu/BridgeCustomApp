/** Staff-facing tips for clip-art studio features. Shown when clicking the “i” icon. */
export const CLIP_ART_TIPS = {
  sandwichFront: {
    title: "Sandwich front",
    body: "Dùng khi một bộ phận cần nằm vừa dưới vừa trên layer khác — ví dụ tóc lọt dưới tay nhưng đè lên áo. Tạo bản Front, kéo hàng Front lên trên Shirt, giữ group gốc dưới Hands. Tick các group nằm trên Front (thường là Hands) ở mục Stay behind để Front bị đục lỗ, không đè lên chúng.",
  },
  sandwichKnockout: {
    title: "Stay behind (punch holes)",
    body: "Tick những group đang nằm trên bản Front. Ứng dụng sẽ đục lỗ đúng chỗ đó (thường là Hands) để Front không che tay. Bỏ tick nếu muốn Front vẽ đè lên group đó.",
  },
  hiddenField: {
    title: "Hidden field",
    body: "Khách không thấy và không chọn group này. Option tự chạy theo group khác (ví dụ Skin). Dùng cho chi tiết nội bộ như mắt nhắm/mở. Bấm icon nhánh trên từng option để chọn option nào hiện khi group kia đang chọn gì.",
  },
  freeSize: {
    title: "Free size & position",
    body: "Bật: mỗi option có size, tỉ lệ và vị trí riêng. Kéo/resize trên canvas chỉ đổi option đang chọn. Ảnh import lúc này giữ tỉ lệ gốc. Tắt (Lock): cả group dùng chung một khung.",
  },
  conditions: {
    title: "Conditions",
    body: "Ẩn hoặc hiện cả một group tùy option đang chọn ở group khác. Ví dụ: IF Skin = Skin 5 hoặc 6 hoặc 7 → HIDE Eyes. Tick nhiều option trong IF nghĩa là OR. AND thêm group khác nếu cần đủ cả hai điều kiện.",
  },
  bulkRename: {
    title: "Bulk rename options",
    body: "Đặt lại tên hàng loạt. Smart: bỏ phần trùng (tên group, token chung) rồi giữ phần khác biệt (màu, số, dáng). Sequential: đặt prefix + số thứ tự.",
  },
  regenerateThumbs: {
    title: "Regenerate thumbnails",
    body: "Cắt lại ảnh vuông cho lưới option. Không đổi file gốc trên canvas, chỉ làm thumbnail dễ nhìn hơn.",
  },
  addEmpty: {
    title: "Add empty (None)",
    body: "Thêm lựa chọn trống: khách chọn None thì group này không vẽ gì. Hữu ích cho phụ kiện (nơ, kính) khi không muốn đeo.",
  },
  addVariants: {
    title: "Add variants",
    body: "Thêm ảnh option vào group hiện tại. Nếu đang bật Free size, mỗi ảnh mới được fit theo tỉ lệ riêng.",
  },
  duplicateGroup: {
    title: "Duplicate group",
    body: "Copy nguyên group (options, hidden/free size, điều kiện option). Bản sao độc lập — sửa không ảnh hưởng group gốc.",
  },
  removeSandwichFront: {
    title: "Remove sandwich front",
    body: "Xóa bản vẽ Front. Group gốc (Hair, v.v.) vẫn giữ nguyên. Có thể tạo lại Front từ menu của group gốc.",
  },
  drivenOption: {
    title: "Show option when…",
    body: "Chỉ dùng với Hidden field. Chọn group nguồn rồi tick option tương ứng. Khi khách chọn option đó, hidden field tự nhảy sang option này (ví dụ Skin nhắm mắt → Eyes dùng bản nhắm).",
  },
} as const;
