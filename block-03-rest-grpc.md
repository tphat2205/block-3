# Block #3 — REST vs gRPC

> **Nguồn:** Slide bài giảng *REST vs gRPC*, MSc. Ngô Ngọc Đăng Khoa, 25 trang (24 trang nội dung/Q&A).
>
> **Mục đích:** Tài liệu Markdown để AI agent tra cứu, hiểu nội dung đã học, hỗ trợ ôn tập và thực hành.
>
> **Phạm vi:** Các mục **1–15** ghi lại và cấu trúc hóa nội dung slide (bao gồm mô tả lại sơ đồ); mục **16–17** là phần tổng hợp/câu hỏi học tập được biên tập thêm, không phải nội dung nguyên văn slide. Không mặc định rằng người học đã triển khai lab thành công.

## 1. Bối cảnh: tình huống đặt hàng (slide 2–4)

Một hệ thống có 3 thành phần:

- **Browser**: gửi yêu cầu đặt hàng.
- **Order API**: nhận yêu cầu, hỏi Inventory còn hàng không rồi tạo đơn.
- **Inventory**: thực hiện kiểm tra/giữ hàng.

Hai kết quả nghiệp vụ:
- **Đủ hàng:** tạo order.
- **Thiếu hàng:** trả lỗi nghiệp vụ.

**Baseline:** Cả hai chặng đều dùng **REST/JSON**:

```text
Browser ── REST/JSON ──> Order API ── REST/JSON ──> Inventory
         POST /orders              POST /reservations
```

Sơ đồ slide 4 minh họa (giá trị response trong sơ đồ):

```text
Browser                 Order API                      Inventory
   | POST /orders           |                              |
   |----------------------->| POST /reservations           |
   |                        |----------------------------->|
   |                        |<--------- 201 reservationId --|  (đủ hàng)
   |<------ 201 orderId -----|                              |
   |                        |<--------- 409 out_of_stock ---|  (thiếu hàng)
   |<------ 409 out_of_stock|                              |
```

**Câu hỏi chính:** Nếu đổi giao thức chặng `Order API → Inventory` từ REST sang gRPC, có cần đổi giao thức chặng `Browser → Order API` không?

**Phương án của bài học:** Không cần; giữ REST/JSON ở chặng ngoài, thay bằng gRPC ở chặng nội bộ. Order API làm lớp chuyển đổi.

## 2. Hai boundary (slide 3)

| Boundary | Consumer | Thành phần hợp đồng cần giữ ổn định |
|---|---|---|
| Browser ↔ Order API | Browser và bên thứ ba | URL, HTTP status, response body |
| Order API ↔ Inventory | Order API | Operation, request/reply message |

- Browser và đối tác bên thứ ba quyết định lịch cập nhật của họ.
- Có thể build lại Order API, nhưng không thể giả định client và server sẽ cập nhật cùng lúc.
- **Bài học kiến trúc:** Chọn giao thức và chiến lược tương thích riêng cho từng boundary; một thay đổi nội bộ không bắt buộc làm thay đổi API công khai.

## 3. REST và RPC: hai mô hình (slide 5)

| Tiêu chí | REST | RPC |
|---|---|---|
| Đơn vị trọng tâm | Resource, ví dụ `reservations` | Operation, ví dụ `Reserve` |
| Cách thực hiện | HTTP method trên URL | Gọi thao tác từ xa bằng request message, nhận reply message |
| Kết quả | HTTP status và response body | Status lời gọi và reply message |
| Ví dụ trong slide | `POST /inventory/reservations` | `Reserve(ReserveRequest)` |

```http
POST /inventory/reservations
```

```text
Reserve(ReserveRequest) -> ReserveReply
```

> **Lưu ý:** Đây là cách bài giảng đối chiếu mô hình REST và RPC, không phải khẳng định mọi REST API hoặc mọi RPC đều phải có đúng hình thức ví dụ trên.

## 4. Ánh xạ lỗi gRPC sang HTTP (slide 6)

Order API chịu trách nhiệm chuyển status/error nội bộ thành HTTP response của Browser API và **giữ hợp đồng HTTP baseline**.

| gRPC status | HTTP tham chiếu trong lab | Trường hợp minh họa |
|---|---:|---|
| `INVALID_ARGUMENT` | `400` | `quantity < 1` |
| `FAILED_PRECONDITION` | `400` | Thiếu hàng, nếu biểu diễn bằng gRPC status |
| `DEADLINE_EXCEEDED` | `504` | Inventory không trả lời kịp |
| `UNAVAILABLE` | `503` | Không kết nối được Inventory |

**Quan trọng:** Các HTTP status ở bảng trên là **giá trị tham chiếu của lab**. Việc ánh xạ ở Browser API vẫn phải tuân theo hợp đồng baseline; ví dụ sơ đồ ban đầu dùng `409 out_of_stock` cho thiếu hàng. Không tự động đồng nhất `FAILED_PRECONDITION → 400` với response công khai `409` mà bỏ qua contract hiện có.

## 5. Protocol Buffers (slide 7–9)

**Protocol Buffers (Protobuf):** ngôn ngữ mô tả cấu trúc message và quy tắc mã hóa nhị phân.

- **File `.proto`:** schema chia sẻ giữa server và client.
- **Field number/tag:** định danh field trên wire; tên field không nằm trong payload nhị phân.
- **Sinh code:** compiler tạo các kiểu dữ liệu và mã serialize/parse cho từng ngôn ngữ.

### 5.1. Ví dụ `inventory.proto` (slide 8)

```proto
syntax = "proto3";

service Inventory {
  rpc Reserve(ReserveRequest) returns (ReserveReply);
}

message ReserveRequest {
  string sku = 1;
  int32 quantity = 2;
}

message ReserveReply {
  bool reserved = 1;
  string reservation_id = 2;
}
```

- `service Inventory`: nhóm các RPC operation.
- `rpc Reserve(...) returns (...)`: khai báo operation, request type và reply type.
- `message`: định nghĩa cấu trúc request/reply.
- `= 1`, `= 2`: **field number**, không phải giá trị mặc định.

### 5.2. So sánh kích thước message đã serialize (slide 9)

| Biểu diễn | Nội dung | Số byte trong slide |
|---|---|---:|
| JSON body | `{"sku":"A1","quantity":2}` | 25 |
| Protobuf message | `0a 02 41 31 10 02` | 6 |

Giải thích wire bytes Protobuf:

- `0a`: field 1, kiểu **length-delimited**.
- `02`: chiều dài chuỗi là 2 byte.
- `41 31`: ký tự `A1`.
- `10`: field 2, kiểu **varint**.
- `02`: giá trị số nguyên `2`.

**Giới hạn phép so sánh:** Chỉ so sánh **message đã serialize**, không phải tổng network traffic hay latency. Mỗi gRPC message còn có **5 byte tiền tố** và HTTP/2 headers; HTTP/JSON cũng có HTTP headers. Không được suy luận gRPC luôn nhanh hơn chỉ vì message ví dụ ít byte hơn.

## 6. Từ `.proto` đến lời gọi RPC (slide 10)

Quy trình 3 bước:

1. **Viết `.proto`:** thiết kế schema chung cho server và client.
2. **Sinh code:** dùng `protoc` hoặc `buf` để tạo message classes, server interface và client stub.
3. **Hiện thực và gọi:** server implement interface; client gọi stub giống như gọi một hàm.

```text
inventory.proto
      |
      v
protoc / buf (code generation)
      |
      +--> message classes
      +--> server interface --> Inventory implementation
      +--> client stub -----> Order API gọi Reserve(...)
```

Slide chỉ nêu quy trình khái niệm; **không cung cấp lệnh build cụ thể theo ngôn ngữ**.

## 7. Khái niệm nền tảng gRPC (slide 11)

- **gRPC:** framework RPC chạy trên HTTP/2, thường dùng Protobuf làm định dạng message.
- **gRPC status code:** mã trạng thái riêng, ví dụ `NOT_FOUND`, `UNAVAILABLE`, tách biệt với HTTP status.
- **Metadata:** các cặp key-value đính kèm lời gọi, ví dụ operation ID hoặc client version.
- **Deadline:** mốc thời gian tối đa client chờ một RPC; quá hạn lời gọi bị hủy từ góc nhìn client.

## 8. Unary và streaming (slide 12)

| Kiểu RPC | Client gửi | Server trả | Ví dụ từ slide |
|---|---|---|---|
| Unary | 1 message | 1 message | `Reserve` |
| Server streaming | 1 message | Nhiều message | Theo dõi thay đổi tồn kho |
| Client streaming | Nhiều message | 1 message | Gửi lô cập nhật tồn kho |
| Bidirectional streaming | Nhiều message | Nhiều message | Hai bên trao đổi liên tục |

**Phạm vi lab:** Chỉ thực hành **unary**; streaming mới giới thiệu về mặt khái niệm.

## 9. Deadline và rủi ro retry (slide 13)

- Client có thể đặt deadline, ví dụ **500 ms** cho cả lời gọi.
- Nếu vượt deadline, client nhận `DEADLINE_EXCEEDED`.
- Server có thể dừng công việc khi RPC bị hủy.
- **Rủi ro với thao tác ghi:** `Reserve` có thể đã thực hiện xong, dù client chỉ quan sát thấy timeout.
- Retry tự động khi không có **idempotency** có thể làm giữ hàng hai lần. Slide ghi idempotency sẽ được học tiếp ở **tuần 5**.

```text
Order API                   Inventory
    | ---- Reserve() ---------> |
    |                            | giữ hàng thành công
    | ... deadline hết hạn ...    |
    | <-- DEADLINE_EXCEEDED       |
    |                            |
    | -- retry Reserve() -------> |  nguy cơ giữ hàng lần 2
```

**Điểm cần hiểu:** Timeout không chứng minh rằng operation phía server chưa xảy ra; cần thiết kế retry và xử lý tác dụng phụ thận trọng.

## 10. Versioning và schema evolution (slide 14–15)

### 10.1. Proto v1

```proto
message ReserveReply {
  bool reserved = 1;
  string reservation_id = 2;
}
```

### 10.2. Proto v2: thêm field tag 3

```proto
message ReserveReply {
  bool reserved = 1;
  string reservation_id = 2;
  optional int32 available = 3;
}
```

### 10.3. Các quy tắc thay đổi schema trong slide

| Thay đổi | Tương thích wire? | Lưu ý |
|---|---|---|
| Thêm field với tag mới | Có | Client cũ bỏ qua field không biết |
| Xóa field | Có nếu quản lý `reserved` phù hợp | Reserve cả tag và tên để tránh tái sử dụng |
| Đổi field number/tag hoặc đổi kiểu | Thường phá tương thích | Đổi tag giống như xóa field rồi thêm field khác |
| Đổi tên field | Wire nhị phân không đổi | Ảnh hưởng JSON và code sinh ra |

> Ghi chú về cách đọc bảng: Đây là các **quy tắc được trình bày trong slide** ở mức khái quát. Tương thích cụ thể còn phụ thuộc kiểu thay đổi, cách dùng field và hành vi ứng dụng.

## 11. Giá trị mặc định và field presence (slide 16)

**Không có explicit presence:**

```proto
int32 available = 3;
```

Trong ví dụ `proto3`, từ phía API sử dụng field, giá trị `0` và field không xuất hiện không phân biệt được bằng cơ chế presence này.

**Có explicit presence:**

```proto
optional int32 available = 3;
```

Có thể xác định field đã được đặt hay chưa, kể cả trường hợp giá trị được đặt là `0`.

**Ý nghĩa:** Khi `0` là giá trị nghiệp vụ hợp lệ nhưng khác với “chưa được cung cấp”, cần chú ý đến presence.

## 12. Wire-compatible khác business-compatible (slide 17)

| Ví dụ thay đổi ở v2 (giả định) | Wire-compatible? | Tác động đến client cũ |
|---|---|---|
| Thêm `optional int32 available = 3` ở reply | Có | Không ảnh hưởng; client cũ bỏ qua field lạ |
| Giữ tag 2 nhưng đổi nghĩa `quantity` từ **sản phẩm lẻ** sang **thùng** | Có | Sai nghiệp vụ: đặt 2 sản phẩm thành 2 thùng |
| Thêm `string warehouse_id = 3` ở request nhưng server từ chối giá trị rỗng | Có | Client cũ không có field đó nên bị từ chối |

**Kết luận trọng tâm:** Protobuf có thể bảo đảm **giải mã được** dữ liệu theo wire format, nhưng **không bảo đảm hai phiên bản hiểu cùng một ý nghĩa nghiệp vụ**.

Định nghĩa dễ nhớ:
- **Wire-compatible:** Bên nhận vẫn đọc/parse được message theo cách mã hóa của giao thức.
- **Business-compatible:** Hành vi và ý nghĩa nghiệp vụ vẫn đúng với kỳ vọng của client cũ.

## 13. Browser boundary và gRPC-Web (slide 18)

- Browser thông thường **không gọi native gRPC trực tiếp** bằng `fetch`/XHR, vì không điều khiển các HTTP/2 frame và trailer mà gRPC native yêu cầu.
- **gRPC-Web** là biến thể phục vụ browser, thường cần proxy hoặc server hỗ trợ; **lab không dùng gRPC-Web**.
- Trong lab, browser **tiếp tục dùng REST/JSON**.
- Order API là điểm chuyển đổi: **nhận REST → gọi gRPC → ánh xạ response/error về REST**.

```text
Browser
   | REST/JSON (giữ nguyên URL/status/body)
   v
Order API (adapter / điểm chuyển đổi)
   | gRPC unary: Inventory.Reserve(...)
   v
Inventory
```

## 14. So sánh và lựa chọn REST/JSON với gRPC (slide 19–20)

### 14.1. Bảng so sánh

| Tiêu chí | REST/JSON | gRPC |
|---|---|---|
| Consumer là browser | Gọi trực tiếp | Cần gRPC-Web |
| Contract | OpenAPI (tùy chọn) | `.proto` cần để sinh code |
| Định dạng message | JSON, văn bản | Thường dùng Protobuf, nhị phân |
| Debug | `curl`, browser DevTools | `grpcurl`, cần thông tin `.proto`/schema |
| Deadline | Client tự đặt timeout | Deadline truyền kèm RPC |

### 14.2. Chọn theo tình huống

| Tình huống | Phương án thường chọn trong slide |
|---|---|
| API cho browser và bên thứ ba | REST/JSON |
| Service nội bộ, hai đầu có cùng toolchain | gRPC **hoặc** REST |
| Cần streaming giữa các service | gRPC |
| Ít service, cùng ngôn ngữ, ít lời gọi | REST có thể đủ; gRPC bổ sung bước sinh code |

**Thông điệp:** Không nên chọn gRPC theo một tiêu chí đơn lẻ như payload nhỏ. Cần cân nhắc consumer, contract, tooling, triển khai và khả năng vận hành.

## 15. Quan sát, bài tập và trình bày (slide 21–25)

### 15.1. Các đại lượng quan sát (slide 21)

| Đại lượng | Nguồn đo | **Không suy ra được** chỉ từ phép đo này |
|---|---|---|
| Browser API | Snapshot HTTP status và response body | Giao thức nội bộ |
| Giao thức nội bộ | Log của hai service | Browser API vẫn không thay đổi |
| Payload | Serialized message, body hoặc bytes trên wire | Thời gian phản hồi |
| Developer experience | Bước sinh code, lỗi, log | Hiệu năng |

**Nguyên tắc đánh giá:** Muốn chứng minh một claim, phải chọn bằng chứng đúng với claim đó. Ví dụ: kích thước payload không thay thế benchmark latency, và log nội bộ không thay thế kiểm thử compatibility của Browser API.

### 15.2. Thực hành (slide 22)

- Bài tập **theo nhóm**, thời lượng **65 phút**.
- Slide chỉ nêu hình thức và thời lượng, **không có đề bài chi tiết hoặc source code đầy đủ**.

### 15.3. Trình bày: phút 95–115 (slide 23)

Gồm **5 phần**:
1. **Problem:** Hai boundary và hai nhóm consumer.
2. **Solution:** Giao thức ở từng boundary và lý do lựa chọn.
3. **Demo:** Cùng luồng trước/sau thay đổi; thử client cũ với server mới.
4. **Evidence:** HTTP snapshots, log gRPC, diff `.proto`, log phiên bản client.
5. **Trade-off:** Chi phí code generation, debugging, rollout.

Phản biện cần kiểm tra:
- Client cũ có thực sự build từ proto v1 không?
- Đơn vị đo payload trước/sau có giống nhau không?
- Chứng minh **wire compatibility** đã đủ để kết luận **business compatibility** chưa?

### 15.4. Exit questions: phút 115–120 (slide 24)

1. Wire-compatible khác business-compatible ở điểm nào?
2. Vì sao Browser API không đổi khi Inventory chuyển sang gRPC?
3. Deadline hết hạn có cho biết chắc chắn `Reserve` đã chạy hay chưa?
4. REST còn phù hợp ở boundary nào?

Slide 25 là **Q&A**, không có kiến thức bổ sung.

---

## 16. Tóm tắt kiến thức trọng tâm dành cho AI agent (biên tập bổ sung)

> Phần này là **tổng hợp từ các slide**, không phải một slide riêng hoặc kiến thức người học đã xác nhận thực hành.

### 16.1. Những điều người học được giới thiệu

- Phân biệt REST (resource/method/status/body) và RPC (operation/request/reply/status).
- Phân biệt **public browser boundary** và **internal service boundary**.
- Biết cách giữ API công khai ổn định khi thay REST bằng gRPC ở giao tiếp nội bộ.
- Đọc cú pháp Protobuf `syntax`, `service`, `rpc`, `message`, `field number` và `optional`.
- Hiểu pipeline `.proto → codegen → server implementation / client stub`.
- Hiểu gRPC hoạt động trên HTTP/2, sử dụng status code, metadata, deadline.
- Biết 4 loại RPC; lab chỉ tập trung vào **unary**.
- Nhận biết deadline/retry của thao tác ghi có rủi ro nhân đôi side effect.
- Phân biệt wire compatibility và business compatibility khi evolve schema.
- Biết các tiêu chí lựa chọn REST/JSON và gRPC và cách thu thập evidence.

### 16.2. Kịch bản kiến trúc cốt lõi

```text
                      PUBLIC CONTRACT (ổn định)
 Browser / third party  ── REST/JSON ──> Order API
                                          |
                                          | Adapter: mapping request, reply, error
                                          v
                                     gRPC client stub
                                          |
                         INTERNAL RPC     | Inventory.Reserve
                                          v
                                    Inventory server
```

**Đáp án khái niệm:** Hệ thống có thể chuyển sang gRPC cho chặng nội bộ mà không buộc browser/bên thứ ba đổi API, miễn là Order API vẫn duy trì hợp đồng công khai.

### 16.3. Những điều **chưa nên tự khẳng định** từ tài liệu

- Không có bằng chứng người học đã chạy một server/client gRPC thực tế.
- Không có command `protoc`, `buf`, Docker hay triển khai chi tiết theo ngôn ngữ cụ thể.
- Không có kết quả benchmark latency, throughput hay memory.
- Không có giải pháp idempotency cụ thể; chỉ được nêu là chủ đề tuần sau.
- Không có bài tập triển khai streaming.

### 16.4. Từ khóa để truy xuất

`REST`, `RPC`, `gRPC`, `REST/JSON`, `HTTP/2`, `boundary`, `Order API`, `Inventory`, `Reserve`, `Protocol Buffers`, `Protobuf`, `.proto`, `field number`, `code generation`, `protoc`, `buf`, `stub`, `unary`, `streaming`, `metadata`, `deadline`, `DEADLINE_EXCEEDED`, `UNAVAILABLE`, `INVALID_ARGUMENT`, `FAILED_PRECONDITION`, `retry`, `idempotency`, `optional`, `field presence`, `schema evolution`, `wire compatibility`, `business compatibility`, `gRPC-Web`, `OpenAPI`, `grpcurl`.

## 17. Câu hỏi ôn tập và đáp án gợi ý (biên tập bổ sung)

**Q1. Chuyển `Order API → Inventory` sang gRPC có cần đổi Browser API không?**  
Không. Hai boundary độc lập; Order API đóng vai trò adapter và giữ URL/status/body đã cam kết với browser.

**Q2. Trong Protobuf, `int32 quantity = 2` có nghĩa quantity mặc định là 2 không?**  
Không. `2` là field number trên wire.

**Q3. Đoạn `{"sku":"A1","quantity":2}` có 25 bytes và protobuf tương ứng 6 bytes thì có kết luận RPC nhanh hơn không?**  
Không. Đó chỉ là so sánh serialized message, chưa tính headers, framing, network và latency.

**Q4. Deadline hết hạn có chứng minh Inventory chưa giữ hàng?**  
Không. Operation có thể đã hoàn tất trước khi client nhận timeout; retry không được xem là an toàn khi thiếu idempotency.

**Q5. Vì sao thêm `warehouse_id` vào request có thể làm hỏng client cũ dù wire-compatible?**  
Nếu server bắt buộc field phải khác rỗng, client cũ không gửi field đó sẽ bị từ chối.

**Q6. `optional int32 available = 3` khác `int32 available = 3` ở đâu?**  
`optional` cho phép kiểm tra field đã được set hay chưa, phân biệt absent với explicitly-set-to-zero.

**Q7. Lab tập trung loại RPC nào?**  
Unary: một request message và một reply message.

**Q8. Làm sao kiểm tra việc chuyển giao thức không phá Browser API?**  
So sánh snapshot URL/status/body trước và sau, đồng thời dùng log ở cả Order API và Inventory để chứng minh chặng nội bộ thực sự gọi gRPC.

---

**Gợi ý cho AI agent:** Xem đây là tài liệu phản ánh **nội dung người dùng đã học/được giới thiệu**, không phải chứng nhận mức độ thành thạo. Khi giải thích, ưu tiên ví dụ Browser → Order API → Inventory; giữ rạch ròi public REST contract với internal gRPC contract; phân biệt ví dụ/số liệu trong slide với những kết luận đã được đo kiểm.
