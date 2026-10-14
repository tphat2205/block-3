# Kế hoạch triển khai Block 3

Tài liệu này ghi lại các lựa chọn thiết kế được lập trước khi triển khai gRPC. Đề bài không quy định sẵn các giá trị cụ thể dưới đây; đây là quyết định của dự án để có thể hiện thực và kiểm chứng bài tập.

## Hai ranh giới giao tiếp và API bên ngoài

- Browser gọi Order API bằng `POST /orders`, gửi JSON `{ "sku": string, "quantity": integer }`.
- Khi đủ hàng, API trả HTTP `201` với `{ "orderId": string, "reservationId": string }`.
- Khi thiếu hàng, API trả HTTP `409` với `{ "error": "out_of_stock" }`.
- Khi dữ liệu đầu vào không hợp lệ, API trả HTTP `400` với `{ "error": "invalid_argument" }`.
- Trước khi so sánh snapshot của API bên ngoài, thay các ID được tạo ngẫu nhiên bằng giá trị giữ chỗ.

## Hợp đồng nội bộ và tồn kho mẫu

- Inventory cung cấp RPC unary `Inventory.Reserve(ReserveRequest) returns (ReserveReply)`.
- Hai phiên bản schema đều giữ nguyên `sku = 1`, `quantity = 2` trong request và `reserved = 1`, `reservation_id = 2` trong reply.
- Thiếu hàng được biểu diễn bằng reply `reserved: false`. Đây là kết quả nghiệp vụ để Order API ánh xạ thành HTTP `409`.
- Dữ liệu tồn kho cố định: `SKU-AVAILABLE` có 10 đơn vị, `SKU-LIMITED` có 1 đơn vị. Demo không trừ tồn kho để kết quả các lần chạy ổn định.
- Schema v2 chỉ thêm `optional int32 available = 3`. Client v2 báo rõ field có mặt hay vắng mặt; nhờ `optional`, giá trị `0` được phân biệt với field vắng.

## Tương thích phiên bản và lỗi giao tiếp

- Giữ riêng schema v1 và client v1 trong `proto/v1/`, `generated/v1/` và `clients/legacy-client.js`. Tạo descriptor JSON từ proto v1 để client cũ dùng tại runtime; lệnh sinh v2 không sinh lại artifact v1.
- Chạy client v1 với server v2 và ghi `clientVersion` vào kết quả. Chạy thêm client v2 với server v2; nếu có điều kiện, chạy client v2 với server v1 để kiểm tra field vắng.
- Order API đặt deadline gRPC là 500 ms. Ánh xạ `DEADLINE_EXCEEDED` thành HTTP `504` và `UNAVAILABLE` thành HTTP `503`, với body JSON ổn định. Thiếu hàng vẫn trả HTTP `409` theo hợp đồng bên ngoài.
- Mô phỏng Inventory chậm bằng header `x-inventory-delay-ms`; mô phỏng không khả dụng bằng một địa chỉ gRPC không có server lắng nghe. Request cần kết thúc trong thời gian hữu hạn.
- Không triển khai streaming hoặc gRPC-Web.

## Đo lường và bằng chứng

- Với cùng một request, so sánh số byte của application message đã serialize: JSON UTF-8 dùng ở chặng REST và Protobuf message bytes dùng ở chặng gRPC. Phép đo không gồm HTTP headers, HTTP/2 framing, tiền tố 5 byte của gRPC hay chi phí mạng.
- Lưu snapshot HTTP trước và sau thay đổi, log của hai service, output sinh code, kết quả kiểm tra client v1/v2, các tình huống lỗi và kích thước payload trong `evidence/`.
- Kích thước payload không chứng minh sự khác biệt về thời gian phản hồi. Nếu báo thời gian HTTP, chạy ít nhất 5 lượt và ghi trung vị cùng khoảng giá trị.

## Quan sát thực tế sau khi chạy

- `proto-loader-gen-types` đã sinh contract TypeScript cho service và message v2; output nằm trong `evidence/codegen.log`. Backend JavaScript nạp `.proto` bằng `@grpc/proto-loader` lúc chạy.
- Lần đầu thử `grpc-tools` trên Windows, plugin native không khởi chạy được (`STATUS_DLL_NOT_FOUND`). Dự án đã chuyển sang generator đi kèm `@grpc/proto-loader` và chạy thành công.
- Lần demo cuối hoàn tất. Log JSON giúp đối chiếu request HTTP, lời gọi nội bộ của Order API, RPC phía Inventory và lỗi được ánh xạ.
- Client v1 đọc descriptor JSON đã build từ proto v1, không đọc `.proto` lúc chạy. Demo ghi SHA-256 của artifact đó và không sinh lại artifact khi gọi server v2. Đây là kiểm tra artifact code cũ, không phải binary native.
- Ca tùy chọn client v2 gọi server v1 đã chạy và báo `availableState: absent`.
- Phép đo payload chỉ đo application message đã serialize. Demo ghi 5 lượt cho mỗi tình huống Inventory chậm/không khả dụng: trung vị và khoảng giá trị chứng minh request kết thúc hữu hạn; số mẫu nhỏ chưa đủ để kết luận về hiệu năng tổng quát.
