# Bài tập Block 3: REST và gRPC giữa các service

> **Môn:** Web nâng cao — Tuần 2, Block 3  
> **Hình thức:** Làm theo nhóm  
> **Thời lượng thực hành:** 65 phút; trình bày sau phần thực hành  
> **Nguồn:** `Bài tập Block 3_ REST và gRPC.pdf` (4 trang).  
> **Trạng thái:** Đây là **đề bài và tiêu chí đánh giá**, không phải lời giải hoặc báo cáo kết quả đã thực hiện.

## 1. Tổng quan bài tập

Hệ thống gồm **Browser**, **Order API** và **Inventory Service**. Ban đầu Order API gọi Inventory bằng **REST**. Nhiệm vụ là:

1. Chuyển giao tiếp **nội bộ** từ REST sang **gRPC**.
2. Giữ nguyên API mà browser đang dùng.
3. Thêm một field vào schema Protobuf.
4. Kiểm tra client cũ được build từ proto trước khi thay đổi.
5. Quan sát payload và developer experience.

### Bối cảnh nghiệp vụ

Người dùng đặt hàng qua `POST /orders` với `sku` và `quantity`. Order API yêu cầu Inventory giữ hàng:

- **Đủ hàng:** tạo order.
- **Thiếu hàng:** trả lỗi nghiệp vụ.

Hệ thống có hai **boundary** với hai nhóm consumer:

| Boundary | Consumer | Yêu cầu |
| --- | --- | --- |
| Browser/bên thứ ba → Order API | Browser và bên thứ ba, nhóm không quyết định lịch cập nhật | Giữ REST/JSON và giữ nguyên contract bên ngoài |
| Order API → Inventory Service | Các service do nhóm viết nhưng triển khai riêng | Chuyển REST sang gRPC và tương thích với client cũ |

Sơ đồ logic (chuyển từ hình minh họa trang 1):

```text
Browser / bên thứ ba
        |
        | REST/JSON — giữ nguyên
        v
     Order API
        |
        | Trước: REST
        | Sau:   gRPC (client mới)
        v
 Inventory Service (server proto mới)
        ^
        |
        | gRPC (proto cũ)
        |
Client cũ đã build từ proto trước khi thêm field
```

**Điểm cốt lõi:** Chặng ngoài giữ REST/JSON, chặng trong đổi sang gRPC, và client build từ proto cũ vẫn phải gọi được server mới.

## 2. Mục tiêu và yêu cầu kỹ thuật

### 2.1. Baseline: REST → REST

- Dựng Order API và Inventory Service giao tiếp bằng REST.
- Dùng **fixture tồn kho xác định** để chạy lại kết quả ổn định.
- Chạy hai trường hợp **đủ hàng** và **thiếu hàng**.
- Ghi **HTTP status và response body** browser nhận ở cả hai trường hợp.
- Ghi **log lời gọi nội bộ** giữa hai service.
- Loại các giá trị động (ví dụ ID, timestamp) trước khi đối chiếu snapshot.

**Evidence cần có:** snapshot status/body và log nội bộ ở baseline.

### 2.2. Chuyển giao tiếp nội bộ sang gRPC

- Viết file `.proto` cho Inventory.
- Sinh code từ `.proto`.
- Hiện thực **Inventory gRPC server**.
- Hiện thực **gRPC client** trong Order API.
- Thay lời gọi REST từ Order API sang Inventory bằng gRPC.
- **Giữ nguyên URL, HTTP status và response body của API ngoài**.
- **Không triển khai** streaming hoặc gRPC-Web trong bài này.

**Evidence cần có:** snapshot API ngoài trước/sau giống nhau, log cho thấy lời gọi nội bộ đã thành gRPC, cùng cách chạy và lệnh sinh code.

### 2.3. Thêm field vào Protobuf schema

- Thêm **một field** vào message bằng **tag mới**.
- Giữ nguyên **tag, kiểu và ý nghĩa** của tất cả field cũ.
- Sinh code lại.
- Cập nhật **client mới** để đọc field vừa thêm.
- **Nhóm tự chọn** field mới và quy tắc xử lý khi field vắng.
- Chú ý **field presence**: với field không có presence, giá trị `0` và field vắng không phân biệt được.

**Evidence cần có:** diff giữa proto cũ/mới, output của bước sinh code, kết quả đọc field mới.

### 2.4. Kiểm tra client cũ và tương thích phiên bản

- Giữ một client **đã build từ proto trước khi thêm field**.
- **Không build lại client cũ**.
- Chạy **client cũ → server mới**: flow đặt hàng phải hoàn tất.
- Chạy **client mới → server mới**: field mới phải được đọc đúng.
- **Nếu còn thời gian:** chạy **client mới → server cũ** để quan sát field vắng.
- Log **version của client** để chứng minh client cũ thực sự là bản build cũ.

| Client | Server | Kết quả cần kiểm tra | Mức độ |
| --- | --- | --- | --- |
| Proto cũ, giữ binary/code đã build | Proto mới | Flow đặt hàng hoàn tất | Bắt buộc |
| Proto mới | Proto mới | Đọc đúng field mới | Bắt buộc |
| Proto mới | Proto cũ | Quan sát field vắng | Nếu còn thời gian |

### 2.5. Xử lý lỗi và deadline

- **Thiếu hàng** không được tùy tiện biến thành **HTTP 500**.
- Nhóm phải chọn cách biểu diễn thiếu hàng trong gRPC: **status hoặc message**.
- Ghi rõ cách Order API **ánh xạ** kết quả/lỗi gRPC thành response theo **contract API ngoài**.
- Giả lập tình huống **Inventory chậm**.
- Giả lập tình huống **Inventory tắt / không khả dụng**.
- Order API phải đặt **deadline**.
- Trong cả hai tình huống, request phải kết thúc trong **thời gian hữu hạn**, không được treo.

**Evidence cần có:** timestamp, status và response ngoài cho tình huống thiếu hàng, Inventory chậm và Inventory tắt.

### 2.6. Đo và quan sát

**Payload chặng nội bộ:**

- Ghi payload trước và sau khi chuyển REST → gRPC.
- Nêu rõ đang đo đại lượng nào: **serialized message**, **HTTP body** hay **wire bytes**.
- So sánh **cùng loại đại lượng đo** giữa hai bên.
- **Không** so JSON body với wire gRPC đã gồm header rồi rút ra kết luận chung.

**Developer experience:** ghi lại quan sát thực tế về:

- Bước sinh code.
- Lỗi compile và runtime thực sự gặp.
- Cách đọc log và debug.
- Độ khó khi phát hành client và server riêng.

**Nếu báo thời gian phản hồi:**

- Chạy **ít nhất 5 lần**.
- Báo **median** và **khoảng giá trị**.
- Ngưỡng 5 lần là **đề xuất riêng của bài tập**, không phải một quy chuẩn chung.

**Evidence cần có:** bảng payload, đại lượng và cách đo; ghi chú developer experience; trade-off và giới hạn của phép đo.

## 3. Tiêu chí đạt

Bài tập đạt yêu cầu khi chứng minh được:

1. **Status và body API ngoài không đổi**, cả hai trường hợp đủ hàng và thiếu hàng, trước và sau chuyển đổi.
2. **Log Order API** cho thấy lời gọi nội bộ bằng **gRPC**.
3. Field mới sử dụng **tag mới**; các field cũ được giữ nguyên.
4. Client **build từ proto cũ, chưa build lại**, chạy hoàn tất flow với server mới.
5. Khi Inventory **chậm hoặc tắt**, request kết thúc trong thời gian hữu hạn.
6. **Số liệu nộp là số liệu chạy thật**, kể cả những kết quả chưa đạt.

## 4. Cách làm theo đề bài

### Bước 1 — Làm rõ với AI agent, lập plan trước khi code

Đề chỉ xác định **mục tiêu**, chưa chốt mọi chi tiết triển khai. Nhóm brainstorm cùng AI agent, ra quyết định và **ghi vào plan trước khi hiện thực gRPC** về:

- Contract của API ngoài.
- File `.proto`.
- Cách biểu diễn **thiếu hàng**.
- Ánh xạ lỗi gRPC → API ngoài.
- Deadline.
- Field mới và cách xử lý khi field vắng.
- Cách chứng minh client cũ.
- Đại lượng đo payload.

> **Lưu ý cho AI agent:** Không được coi bất kỳ quyết định chưa chốt nào ở trên là yêu cầu cụ thể đã được đề bài quy định. Hãy đề xuất phương án và hỏi nhóm chốt khi cần.

### Bước 2 — Hiện thực và kiểm chứng

Sử dụng vòng lặp:

```text
inspect → plan → implement → run → test → verify
```

Thứ tự gợi ý trong đề:

1. Baseline REST và snapshot.
2. Proto và gRPC.
3. Thêm field.
4. Thử client cũ.
5. Inventory chậm hoặc tắt.
6. Đo và quan sát.

### Bước 3 — Tự kiểm soát

- Nhóm đọc code diff.
- Nhóm giải thích log và tự bảo vệ quyết định kỹ thuật.
- **Câu trả lời của agent không được dùng làm evidence**; evidence phải là kết quả chạy, bản ghi và phép đo thực tế.

## 5. Sản phẩm phải nộp

- [ ] Repository có **README** hướng dẫn chạy lại toàn bộ, gồm cả **lệnh sinh code**.
- [ ] **Plan** chứa các quyết định đã thống nhất với agent, viết **trước khi hiện thực gRPC**.
- [ ] Snapshot **status + body API ngoài** trước và sau, cho cả **đủ hàng** và **thiếu hàng**.
- [ ] **Log Order API và Inventory** thể hiện lời gọi nội bộ trước (REST) và sau (gRPC).
- [ ] **Diff `.proto`** trước/sau khi thêm field, kèm output bước sinh code.
- [ ] **Evidence client cũ:** cách build từ proto cũ, log version và kết quả chạy với server mới; kèm kết quả client mới.
- [ ] Kết quả khi **thiếu hàng**, **Inventory chậm** và **Inventory tắt**: timestamp, status, response ngoài.
- [ ] **Bảng payload** kèm định nghĩa đại lượng đo và phương pháp đo; ghi chú developer experience.
- [ ] **Trade-off** và giới hạn phép đo.

**Quy định về dữ liệu:** Dùng dữ liệu giả. Che secret, token và dữ liệu cá nhân thật trước khi nộp.

## 6. Yêu cầu trình bày

Mỗi nhóm trình bày **5 phần**:

| Phần | Nội dung |
| --- | --- |
| **Problem** | Bài toán, hai boundary và các consumer |
| **Solution** | Phương án kỹ thuật, lựa chọn giao thức và quyết định thiết kế |
| **Demo** | Chạy thật **cùng một business flow** qua hai boundary trước/sau; có **client cũ với server mới** |
| **Evidence** | Kết quả chạy, snapshot, log, proto diff và số đo |
| **Trade-off** | Chi phí, hạn chế, đánh đổi kỹ thuật và phép đo |

**Bắt buộc:** Demo chạy thật, **không thay bằng ảnh chụp code**.

## 7. Hướng dẫn ngắn cho AI agent đọc tài liệu này

Đây là phần tổ chức lại yêu cầu nhằm hỗ trợ AI agent, **không phải yêu cầu bổ sung của giảng viên**.

1. **Phân biệt yêu cầu bắt buộc và tùy chọn:** kiểm tra client mới với server cũ là phần *nếu còn thời gian*; streaming và gRPC-Web *không nằm trong phạm vi triển khai*.
2. **Không tự coi đề đã quy định lựa chọn kỹ thuật:** HTTP status/body cụ thể của API ngoài, định nghĩa `.proto`, field bổ sung, ánh xạ lỗi, deadline và đơn vị đo cần được nhóm chốt trong plan.
3. **Bảo toàn hai boundary:** chỉ thay cách giao tiếp nội bộ; chứng minh contract với browser/bên thứ ba không bị thay đổi.
4. **Chứng minh compatibility bằng chạy thực tế:** tránh chỉ suy luận từ schema; đặc biệt không build lại client được yêu cầu giữ nguyên.
5. **Không ngụy tạo evidence:** mọi log, số đo, ảnh chụp kết quả, thời gian phản hồi và kết luận demo phải bắt nguồn từ lần chạy thật.
6. **Làm theo trình tự có kiểm chứng:** baseline → đổi gRPC → thêm field → compatibility → lỗi/deadline → đo.

### Những chi tiết đề chưa quy định cụ thể

- Ngôn ngữ lập trình, framework và cấu trúc repository.
- Nội dung chính xác của response cho `POST /orders`, ngoại trừ yêu cầu giữ nguyên trước/sau.
- Tên service, RPC, kiểu message và field sẽ thêm.
- Deadline bằng bao nhiêu mili-giây.
- Cách mô phỏng Inventory chậm/tắt và công cụ đo payload.

**AI agent cần trao đổi/chốt các lựa chọn này trong plan, thay vì trình bày chúng như sự thật có sẵn từ đề.**

---

*Nguồn gốc: Chuyển đổi nội dung từ PDF bài tập 4 trang. Các mục 1–6 trình bày lại nội dung đề; mục 7 là hướng dẫn tổ chức thông tin bổ sung để AI agent sử dụng đúng phạm vi yêu cầu.*
