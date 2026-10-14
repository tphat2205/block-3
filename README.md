# Block 3 — REST boundary, gRPC nội bộ

Demo Node.js cho bài tập REST và gRPC. Browser tiếp tục gọi `POST /orders` bằng REST/JSON. Có thể chạy Order API ở chế độ baseline để gọi Inventory qua REST hoặc ở chế độ mới để gọi Inventory bằng gRPC unary.

## Chạy nhanh

Cần Node.js 18 trở lên. Tại thư mục dự án:

```bash
npm install
npm run generate
npm run demo
```

Trên PowerShell nếu `npm` bị chặn bởi Execution Policy, dùng `npm.cmd install`, `npm.cmd run generate` và `npm.cmd run demo`.

`npm run demo` khởi động lần lượt hai service cho baseline REST, sau đó chạy lại cùng request qua gRPC. Demo tự gọi client schema v1 và v2, giả lập Inventory chậm và Inventory không khả dụng, rồi ghi kết quả thực tế vào `evidence/`. Không cần chạy hai service bằng tay cho luồng demo này.

Để thử giao diện HTML bằng tay, mở ba terminal trong thư mục dự án:

```bash
npm run inventory:grpc
```

```bash
npm run order:grpc
```

Mở <http://127.0.0.1:3000/>. Chọn `SKU-AVAILABLE` để tạo đơn thành công; chọn `SKU-LIMITED` với số lượng 2 để nhận HTTP 409.

Để xem baseline REST thủ công, chạy `npm run inventory:rest` và `npm run order:rest` thay cho hai lệnh gRPC. Cả hai chế độ cùng dùng URL ngoài `POST /orders`.

## Quyết định thiết kế

Các lựa chọn được ghi trước khi hiện thực gRPC trong [PLAN.md](PLAN.md):

- Contract ngoài: `POST /orders`, thành công HTTP 201 với `orderId` và `reservationId`; thiếu hàng HTTP 409 với `{"error":"out_of_stock"}`.
- Fixture cố định: `SKU-AVAILABLE` có 10 đơn vị, `SKU-LIMITED` có 1. Demo không trừ tồn kho nên chạy lại cho kết quả nghiệp vụ ổn định.
- Thiếu hàng là kết quả nghiệp vụ trong reply gRPC (`reserved: false`), không phải lỗi transport.
- Deadline gRPC là 500 ms. `DEADLINE_EXCEEDED` ánh xạ sang HTTP 504; `UNAVAILABLE` ánh xạ sang HTTP 503.
- Proto v2 thêm `optional int32 available = 3`. Client mới kiểm tra presence; field vắng khác với giá trị 0.
- Dữ liệu payload là số byte của application message đã serialize: UTF-8 JSON body và Protobuf message bytes. Không tính gRPC prefix 5 byte, headers, HTTP/2 framing hoặc mạng.

## Proto và sinh code

- [proto/v1/inventory.proto](proto/v1/inventory.proto) là schema client cũ: `sku = 1`, `quantity = 2`; reply có `reserved = 1`, `reservation_id = 2`.
- [proto/v2/inventory.proto](proto/v2/inventory.proto) giữ nguyên các field trên và thêm `optional int32 available = 3`.
- `npm run generate` gọi `proto-loader-gen-types` để tạo TypeScript contract cho schema hiện tại ở `generated/v2/`. JavaScript backend nạp `.proto` bằng `@grpc/proto-loader` lúc chạy.
- `npm run generate:v1` sinh contract v1 và descriptor JSON cố định tại `generated/v1/inventory-descriptor.json`. Lệnh này dùng để tạo client cũ; không chạy lại khi kiểm tra tương thích với server v2.
- Sau khi đóng băng client cũ, `npm run generate` chỉ sinh v2. Output của hai bước nằm trong [codegen-v1.log](evidence/codegen-v1.log) và [codegen.log](evidence/codegen.log). Generated types thể hiện `available` và `_available` là tùy chọn trong v2; các field cũ giữ nguyên.

Diff của `ReserveReply`:

```diff
 message ReserveReply {
   bool reserved = 1;
   string reservation_id = 2;
+  optional int32 available = 3;
 }
```

Client tương thích cũ là [clients/legacy-client.js](clients/legacy-client.js), cố định ở `order-client-proto-v1` và chỉ đọc descriptor đã sinh từ proto v1; khi chạy, nó không đọc file `.proto`. Demo ghi SHA-256 của descriptor để nhận diện artifact v1 và không sinh lại artifact đó khi gọi server v2. Client mới dùng proto v2 và xác nhận `available: 10` có presence.

## Kết quả chạy đã ghi

Kết quả và thời gian UTC của lần chạy gần nhất nằm trong [evidence/demo-run.json](evidence/demo-run.json); log từng service nằm ở các file `evidence/*-*.log`.

| Trường hợp | REST baseline | gRPC nội bộ | Kết quả |
|---|---:|---:|---|
| Còn hàng | HTTP 201 | HTTP 201 | Cùng body sau khi thay ID động bằng placeholder |
| Thiếu hàng | HTTP 409 | HTTP 409 | `{"error":"out_of_stock"}` |
| Inventory chậm 900 ms | — | 5/5 lượt HTTP 504; trung vị 515 ms, khoảng 507–519 ms | Deadline 500 ms kết thúc request hữu hạn |
| Inventory không khả dụng | — | 5/5 lượt HTTP 503; trung vị 2 ms, khoảng 1–23 ms | Order API nhận `UNAVAILABLE` |
| Client proto v1 → server v2 | — | `reserved: true` | Client v1 bỏ qua field v2 không biết đến |
| Client proto v2 → server v2 | — | `available: 10`, presence `true` | Field mới đọc được |
| Client proto v2 → server v1 | — | `availableState: absent` | Ca kiểm tra tùy chọn: client phân biệt field vắng |

Payload request mẫu `{ "sku": "SKU-AVAILABLE", "quantity": 2 }` trong lần đo: JSON UTF-8 **36 byte**, Protobuf serialized message **17 byte** (`0a0d534b552d415641494c41424c451002`). Đây chỉ là kích thước hai application message cùng biểu diễn một request; kết quả này không đo tổng lưu lượng hay latency. Số liệu thời gian ở bảng lấy từ 5 lượt chạy cục bộ mỗi tình huống, chưa phải benchmark tải.

## Ánh xạ lỗi và contract

| Tình huống | gRPC/Inventory | HTTP ngoài |
|---|---|---:|
| Request sai trước khi gọi Inventory | — | 400 `invalid_argument` |
| Không đủ tồn kho | Reply `reserved: false` | 409 `out_of_stock` |
| Deadline hết | `DEADLINE_EXCEEDED` | 504 `inventory_timeout` |
| Inventory dừng/không kết nối được | `UNAVAILABLE` | 503 `inventory_unavailable` |

## Cấu trúc chính

```text
src/                 Order API và hai Inventory service
proto/v1, proto/v2/  Schema trước/sau thay đổi
generated/v1, v2/    Contract được sinh từ proto
clients/             Client cũ và client hiện tại
public/              Trang HTML gửi REST request
scripts/             Sinh contract và chạy demo thu evidence
evidence/            Snapshot, log và payload từ lần chạy thật
```

## Quan sát và giới hạn

- Code generation thêm bước vào quy trình. Một lần thử `grpc-tools` trên Windows gặp lỗi plugin native không khởi chạy được; dự án chuyển sang generator `proto-loader-gen-types` đã chạy thành công trong môi trường này. Runtime Node dùng `.proto` trực tiếp.
- Log JSON ở Order API ghi transport và RPC; log Inventory xác nhận request đã tới `Inventory.Reserve`. Khi deadline hết, server demo có thể hoàn tất timer sau khi client đã timeout; đây là lý do timeout không chứng minh chắc chắn nghiệp vụ phía server chưa chạy.
- Client cũ đọc descriptor JSON được build từ proto v1 và giữ nguyên khi chạy với server v2. Đây là artifact đã sinh từ schema cũ; Node.js vẫn thực thi JavaScript nên không phải binary native đã biên dịch.
- Lượt client v1 chứng minh flow thành công khi server thêm field chưa biết; lượt này không bao quát mọi hành vi nghiệp vụ của phiên bản client cũ, nên wire compatibility không tự chứng minh business compatibility tổng quát.
- Fixture trong bộ nhớ và server insecure chỉ dùng cho bài tập cục bộ. Không có cơ chế trừ/hoàn tồn kho, idempotency, xác thực, TLS hay benchmark tải.
- So sánh payload không gồm framing/header; không thể dùng nó để kết luận gRPC luôn nhanh hơn REST.
