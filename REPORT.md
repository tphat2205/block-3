# Báo cáo lựa chọn thiết kế — Block 3 REST và gRPC

## Kết quả cuối cùng

Nhóm giữ `POST /orders` bằng REST/JSON cho browser và chuyển lời gọi từ Order API sang Inventory Service sang gRPC unary. Với cùng dữ liệu mẫu, API ngoài trả HTTP `201` khi đủ hàng và HTTP `409` khi thiếu hàng ở cả hai chế độ. Snapshot, log và kết quả chạy nằm trong [evidence/demo-run.json](evidence/demo-run.json); cách chạy lại nằm trong [README.md](README.md).

## Các lựa chọn của nhóm

| Lựa chọn | Lý do chọn và đánh đổi |
|---|---|
| **Node.js và Express 5 cho hai service** | Một ngôn ngữ JavaScript cho backend, client và script demo; Express xử lý route, JSON và trang HTML với ít cấu hình. Spring Boot phù hợp khi cần hệ sinh thái Java lớn hơn nhưng thêm toolchain cho bài có một API công khai. Node `http` thuần ít dependency hơn nhưng cần tự xử lý nhiều phần cơ bản. Nhóm không benchmark các stack này. |
| **REST/JSON ở Browser → Order API; gRPC ở Order API → Inventory** | Browser gọi REST trực tiếp bằng `fetch`, nên giữ được URL, status và body đã cam kết. Chặng nội bộ do nhóm kiểm soát dùng `.proto` để định nghĩa RPC `Inventory.Reserve`. Đưa gRPC ra browser sẽ cần gRPC-Web/hỗ trợ bổ sung, không phục vụ mục tiêu bài tập. |
| **RPC unary và Protobuf v2** | Mỗi lần giữ hàng chỉ cần một request và một reply, nên không dùng streaming. V2 chỉ thêm `optional int32 available = 3`, giữ nguyên field cũ. `optional` cho phép client mới phân biệt `available = 0` với field vắng; client v1 vẫn đọc được reply v2 trong flow đã thử. |
| **`reserved: false` cho thiếu hàng** | Thiếu hàng là kết quả nghiệp vụ dự kiến, được Order API ánh xạ thành HTTP `409 out_of_stock`. Nhóm dành gRPC status cho lỗi giao tiếp như `DEADLINE_EXCEEDED` và `UNAVAILABLE`, tương ứng HTTP `504` và `503`. |
| **Deadline 500 ms, không retry tự động** | Request kết thúc hữu hạn khi Inventory chậm hoặc mất kết nối. `Reserve` là thao tác ghi; sau timeout không thể khẳng định server chưa giữ hàng. Retry an toàn cần idempotency, chưa triển khai trong phạm vi bài này. |
| **Fixture tồn kho cố định và HTML đơn giản** | `SKU-AVAILABLE = 10`, `SKU-LIMITED = 1` cho kết quả lặp lại được, không cần reset database. Một trang HTML với `fetch` đủ trình diễn browser. Đổi lại, demo chưa có lưu tồn kho, xử lý đồng thời hay giao diện ứng dụng lớn. |
| **Log JSON và tài liệu trong repository** | Log của hai service ghi thời gian, giao thức và operation để đối chiếu REST trước/gRPC sau. README hướng dẫn chạy, PLAN ghi quyết định, báo cáo này giải thích lựa chọn. ELK và Swagger/OpenAPI hữu ích khi có nhiều service hoặc endpoint cần quản trị tập trung; nhóm chưa triển khai các công cụ đó cho demo nhỏ này. |

Trong môi trường Windows của nhóm, lần thử generator native `grpc-tools` gặp lỗi plugin. Nhóm dùng `@grpc/grpc-js` và `@grpc/proto-loader` để chạy gRPC, `proto-loader-gen-types` để sinh contract. Client v1 đọc descriptor đã sinh từ proto v1 và được giữ nguyên khi gọi server v2; [log sinh v1](evidence/codegen-v1.log) cùng hash trong evidence giúp xác định artifact cũ. Node.js vẫn chạy JavaScript, không tạo binary native.

## Bằng chứng và giới hạn kết luận

Snapshot HTTP đủ hàng/thiếu hàng trước và sau trùng nhau sau khi thay ID ngẫu nhiên bằng giá trị giữ chỗ. Log [Order API](evidence/grpc-order.log) và [Inventory](evidence/grpc-inventory.log) xác nhận chặng nội bộ dùng gRPC. Client v1 gọi server v2 thành công; client v2 đọc `available: 10` từ server v2 và thấy field vắng khi gọi server v1. Năm lượt Inventory chậm đều trả HTTP `504`; năm lượt không khả dụng đều trả HTTP `503` trong thời gian hữu hạn.

Với cùng request mẫu, JSON body có 36 byte và Protobuf message có 17 byte. Đây là kích thước **application message đã serialize**, chưa tính header/framing và không chứng minh gRPC nhanh hơn REST. Fixture, log cục bộ và kết nối gRPC không TLS chỉ dùng cho bài thực hành; hệ thống thật cần cơ chế tồn kho bền vững, idempotency, bảo mật và quan sát tập trung.
