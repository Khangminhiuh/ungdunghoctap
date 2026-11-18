# Nhịp học Miku trên Vercel
1. Giải nén. Tạo repository GitHub, chọn Add file → Upload files. Kéo các thư mục api, lib, public và các file package.json, vercel.json vào repo rồi Commit changes. Kiểm tra vercel.json nằm ngay trang đầu của repo.
2. Trong https://console.upstash.com tạo một Redis database. Mở mục REST API và sao chép UPSTASH_REDIS_REST_URL và UPSTASH_REDIS_REST_TOKEN (token có quyền ghi).
3. Mở https://vercel.com/new → Import repo. Chọn Framework Preset “Other”, giữ Root Directory ở gốc repo và để Build Command trống.
4. Mở Environment Variables trước khi bấm Deploy. Thêm UPSTASH_REDIS_REST_URL và UPSTASH_REDIS_REST_TOKEN từ bước 2. Thêm NHIP_HOC_KEY với giá trị là một mật khẩu ngẫu nhiên dài do bạn tự đặt và lưu trong trình quản lý mật khẩu. Chỉ nhập giá trị trên Vercel, giữ riêng cả token và mã truy cập. Nếu đã Deploy trước khi thêm biến, vào Deployments → Redeploy.
5. Mở Visit, nhập NHIP_HOC_KEY để vào nhật ký. Ghi một hoạt động rồi tải lại trang để kiểm tra. Bản mới dùng dữ liệu trong Redis bạn vừa tạo. Nhật ký cũ trên ChatGPT Sites nằm ở kho khác.
