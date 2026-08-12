# 端对端加密（E2EE）方案设计

> 参考 Signal Protocol 与 WhatsApp E2EE 实现，结合 mushroom-app 现有架构设计。

---

## 1. 目标与范围

| 目标                        | 说明                                           |
| --------------------------- | ---------------------------------------------- |
| 消息内容对服务器不可见      | 服务器只存储密文，无法解密                     |
| 多设备支持                  | 同一用户多设备均可解密消息                     |
| 前向保密（Forward Secrecy） | 密钥泄露不影响历史消息                         |
| 异步投递                    | 接收方离线时消息可暂存服务器                   |
| 覆盖范围                    | 单聊（type=1）、群聊（type=2）的文本与文件消息 |

---

## 2. 密码学原语

| 用途                 | 算法                                   |
| -------------------- | -------------------------------------- |
| 身份密钥对           | Ed25519（签名） / X25519（DH）         |
| 临时密钥对（Prekey） | X25519                                 |
| 密钥派生             | HKDF-SHA256                            |
| 对称加密             | AES-256-GCM                            |
| 消息认证             | AEAD（GCM 内置）                       |
| 密钥协商             | X3DH（Extended Triple Diffie-Hellman） |
| 消息链               | Double Ratchet Algorithm               |

---

## 3. 密钥体系

### 3.1 每设备密钥集合（Device Key Bundle）

```
IdentityKey (IK)        — 长期身份密钥，Ed25519，设备注册时生成
SignedPreKey (SPK)      — 中期签名预密钥，X25519，定期轮换（建议 7 天）
OneTimePreKeys (OPK)    — 一次性预密钥池，X25519，每次 X3DH 消耗一个
```

所有公钥上传至服务器；私钥**永不离开设备**。

### 3.2 群聊附加密钥

```
SenderKey               — 每个成员在每个群中持有一个发送密钥
                          使用 Signal SenderKey 协议分发
```

---

## 4. 协议流程

### 4.1 设备注册（Key Upload）

```
Client                              Server
  |                                   |
  |-- POST /users/devices/keys ------->|
  |   { ik_pub, spk_pub, spk_sig,     |
  |     opk_pub[] }                   |
  |                                   |
  |<-- 200 OK ----------------------- |
```

服务器存储公钥包，不验证私钥，仅验证 `spk_sig`（IK 对 SPK 的签名）。

### 4.2 单聊会话建立（X3DH）

发送方 Alice 向接收方 Bob 发送第一条消息：

```
Alice                    Server                    Bob
  |                        |                        |
  |-- GET /keys/{bob} ---->|                        |
  |<-- Bob's KeyBundle ----|                        |
  |   (IK_B, SPK_B, OPK_B)|                        |
  |                        |                        |
  | [X3DH 本地计算]         |                        |
  | DH1 = DH(IK_A, SPK_B) |                        |
  | DH2 = DH(EK_A, IK_B)  |                        |
  | DH3 = DH(EK_A, SPK_B) |                        |
  | DH4 = DH(EK_A, OPK_B) |                        |
  | SK = HKDF(DH1‖DH2‖DH3‖DH4)                    |
  |                        |                        |
  |-- 发送加密消息 -------->|                        |
  |   { IK_A_pub, EK_A_pub,|                        |
  |     OPK_B_id,          |                        |
  |     ciphertext }       |-- 投递 --------------->|
  |                        |                        |
  |                        |          [Bob 重算 SK] |
  |                        |          [解密消息]    |
```

### 4.3 Double Ratchet（会话内消息）

X3DH 建立共享密钥 SK 后，双方进入 Double Ratchet：

```
每条消息：
  1. Diffie-Hellman Ratchet：双方轮换 DH 密钥对，派生新链密钥
  2. Symmetric Ratchet：从链密钥派生消息密钥 MK
  3. 用 MK 做 AES-256-GCM 加密，用后销毁 MK
```

每条消息携带：

- 发送方当前 DH 公钥（ratchet key）
- 消息序号（用于跳过丢失消息）
- 加密后的消息体（ciphertext + nonce + tag）

### 4.4 群聊（SenderKey 协议）

```
Alice 加入群组后：
  1. 生成 SenderKey（链密钥 + 签名密钥）
  2. 对每个群成员，用单聊 E2EE 通道分发 SenderKey
  3. 发消息时用自己的 SenderKey 对称加密，一次加密，所有成员可解密

成员变更：
  - 有成员加入/退出时，所有现有成员重新生成并分发新 SenderKey
```

---

## 5. 消息格式变更

### 5.1 现有 ChatMessage 扩展

```typescript
// packages/shared/src/types/models.ts 扩展
interface EncryptedMessageContent {
  v: 1; // 协议版本
  ct: string; // Base64 密文（AES-256-GCM）
  iv: string; // Base64 nonce（12 bytes）
  // 单聊附加（首条消息）
  x3dh?: {
    ik: string; // 发送方 IK 公钥
    ek: string; // 临时密钥公钥
    opk_id?: string; // 消耗的 OPK id
  };
  // Double Ratchet 头
  dr?: {
    dh: string; // 当前 ratchet 公钥
    pn: number; // 上一链消息数
    n: number; // 当前链消息序号
  };
}
```

服务器存储 `content` 字段为上述密文结构，**不解析内部字段**。

### 5.2 文件消息

文件先上传至 MinIO，上传前客户端用随机 AES-256-GCM 密钥加密文件内容。文件密钥随消息密文一起加密传输：

```typescript
interface EncryptedFileContent extends EncryptedMessageContent {
  file_key: string; // 加密后的文件对称密钥（包含在 ct 中）
  file_url: string; // MinIO 密文文件 URL（明文，服务器可见）
  file_size: number; // 密文大小
}
```

---

## 6. 服务端变更

### 6.1 新增 API

| 方法   | 路径                             | 说明                               |
| ------ | -------------------------------- | ---------------------------------- |
| POST   | `/users/devices/keys`            | 上传设备公钥包                     |
| GET    | `/users/:userId/keys`            | 获取目标用户所有设备的公钥包       |
| DELETE | `/users/devices/keys/opk/:id`    | 消耗 OPK（服务器在分发后自动删除） |
| POST   | `/conversations/:id/sender-keys` | 群聊 SenderKey 分发（加密后存储）  |

### 6.2 新增数据表

```sql
-- 设备公钥包
CREATE TABLE device_keys (
  device_id       TEXT NOT NULL,
  user_id         INTEGER NOT NULL,
  ik_pub          TEXT NOT NULL,       -- Identity Key 公钥
  spk_pub         TEXT NOT NULL,       -- Signed PreKey 公钥
  spk_sig         TEXT NOT NULL,       -- IK 对 SPK 的签名
  spk_id          INTEGER NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (device_id)
);

-- 一次性预密钥池
CREATE TABLE device_opks (
  id              TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL,
  user_id         INTEGER NOT NULL,
  opk_pub         TEXT NOT NULL,
  used            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 群聊 SenderKey 分发记录（密文）
CREATE TABLE group_sender_keys (
  conversation_id TEXT NOT NULL,
  sender_user_id  INTEGER NOT NULL,
  recipient_device_id TEXT NOT NULL,
  encrypted_sender_key TEXT NOT NULL,  -- 用单聊 E2EE 加密的 SenderKey
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, sender_user_id, recipient_device_id)
);
```

### 6.3 现有逻辑不变

- `message_service.ts` 的 `saveMessage` 不解析 `content` 字段，直接存储密文
- Outbox/WebSocket 投递流程不变
- 服务器不持有任何解密能力

---

## 7. 客户端职责

```
┌─────────────────────────────────────────────┐
│              客户端 E2EE 模块                │
├─────────────────────────────────────────────┤
│ KeyStore        本地加密存储所有私钥          │
│ SessionStore    Double Ratchet 会话状态      │
│ X3DHManager     建立新会话                   │
│ RatchetEngine   消息加解密                   │
│ SenderKeyStore  群聊发送密钥管理             │
└─────────────────────────────────────────────┘
```

- 私钥存储：移动端用 Keychain（iOS）/ Keystore（Android）；桌面端用系统密钥链或加密本地 DB
- 会话状态持久化到本地加密 SQLite
- 多设备：新设备登录时，通过已登录设备的安全通道同步历史会话密钥（可选，类似 WhatsApp 多设备方案）

---

## 8. 密钥轮换与安全策略

| 场景       | 处理                                                              |
| ---------- | ----------------------------------------------------------------- |
| OPK 耗尽   | 客户端检测到服务器 OPK 数量 < 阈值时补充上传                      |
| SPK 轮换   | 每 7 天客户端生成新 SPK 并上传，旧 SPK 保留 30 天用于解密历史消息 |
| 设备注销   | 删除 `device_keys`，通知群组成员重新分发 SenderKey                |
| 安全码验证 | 客户端展示 IK 指纹（Safety Number），用户可带外核验防中间人       |

---

## 9. 实施路线图

```
Phase 1 — 基础设施（2 周）
  ✦ 数据库表：device_keys, device_opks
  ✦ API：密钥上传 / 获取
  ✦ 客户端 KeyStore + X3DH 实现

Phase 2 — 单聊 E2EE（2 周）
  ✦ Double Ratchet 引擎
  ✦ 消息加解密集成
  ✦ 服务端透传验证

Phase 3 — 群聊 E2EE（1 周）
  ✦ SenderKey 协议
  ✦ 成员变更重新分发

Phase 4 — 文件 & 多设备（1 周）
  ✦ 文件加密上传
  ✦ 多设备会话同步
  ✦ 安全码 UI
```

---

## 10. 与现有架构的兼容性

| 现有模块             | 影响                                             |
| -------------------- | ------------------------------------------------ |
| `message_service.ts` | 无需修改，`content` 字段透传                     |
| `outbox_worker`      | 无需修改，投递密文                               |
| WebSocket            | 无需修改                                         |
| MinIO 文件存储       | 存储密文文件，URL 不变                           |
| JWT 认证             | 无需修改                                         |
| `user_devices` 表    | 新增关联 `device_keys` 表，通过 `device_id` 关联 |

---

_参考：[Signal Protocol](https://signal.org/docs/)，[WhatsApp E2EE White Paper](https://www.whatsapp.com/security/WhatsApp-Security-Whitepaper.pdf)_
