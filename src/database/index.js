import initSqlJs from "sql.js";

/*
============================================================
LOCAL SQLITE DATABASE
============================================================

Database is stored as a SQLite database in IndexedDB.

Architecture:

React
  ↓
database/index.js
  ↓
SQL.js SQLite
  ↓
SQLite binary
  ↓
IndexedDB

This means chat data survives:
- page refresh
- browser restart
- React reload
- Vite restart

The actual SQLite database is NOT stored on the Spring Boot server.
============================================================
*/

const DB_NAME = "chat_web_local";
const DB_STORE = "sqlite";
const DB_KEY = "chat_database";

let SQL = null;
let db = null;
let initialized = false;
let initPromise = null;


/* ============================================================
   INDEXEDDB
============================================================ */

function openStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(DB_STORE)) {
        database.createObjectStore(DB_STORE);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}


async function loadDatabaseBytes() {
  const storage = await openStorage();

  return new Promise((resolve, reject) => {
    const transaction = storage.transaction(DB_STORE, "readonly");
    const store = transaction.objectStore(DB_STORE);

    const request = store.get(DB_KEY);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}


async function saveDatabaseBytes() {
  if (!db) {
    throw new Error("Database is not initialized");
  }

  const bytes = db.export();

  const storage = await openStorage();

  return new Promise((resolve, reject) => {
    const transaction = storage.transaction(DB_STORE, "readwrite");
    const store = transaction.objectStore(DB_STORE);

    const request = store.put(bytes, DB_KEY);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}


/* ============================================================
   DATABASE INITIALIZATION
============================================================ */

export async function initDatabase() {
  if (initialized && db) {
    return db;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      SQL = await initSqlJs({
        locateFile: () => "/sql-wasm.wasm",
      });

      const savedBytes = await loadDatabaseBytes();

      if (savedBytes) {
        db = new SQL.Database(savedBytes);
      } else {
        db = new SQL.Database();
      }

      createTables();

      initialized = true;

      await saveDatabaseBytes();

      console.log("SQLite database initialized");

      return db;
    } catch (error) {
      console.error("SQLite initialization failed:", error);
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}


/* ============================================================
   CHECK DATABASE
============================================================ */

function requireDatabase() {
  if (!db) {
    throw new Error(
      "SQLite database is not initialized. Call initDatabase() first."
    );
  }

  return db;
}


/* ============================================================
   CREATE TABLES
============================================================ */

function createTables() {
  const database = requireDatabase();

  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      phone TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS chats (
      chat_id TEXT PRIMARY KEY,
      user_phone TEXT NOT NULL,
      is_group INTEGER NOT NULL DEFAULT 0,
      name TEXT,
      members TEXT NOT NULL,
      last_message TEXT,
      last_message_time INTEGER,
      unread_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      sender_phone TEXT NOT NULL,
      receiver_phone TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SENDING',
      created_at INTEGER NOT NULL,
      delivered_at INTEGER,
      read_at INTEGER
    )
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id
    ON messages(chat_id)
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages(created_at)
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_chats_updated_at
    ON chats(updated_at)
  `);
}


/* ============================================================
   GENERATE DETERMINISTIC CHAT ID
============================================================ */

export function generateChatId(phone1, phone2) {
  if (!phone1 || !phone2) {
    throw new Error("Both phone numbers are required");
  }

  return [String(phone1), String(phone2)]
    .sort()
    .join("_");
}


/* ============================================================
   USER FUNCTIONS
============================================================ */

export function saveUser(user) {
  const database = requireDatabase();

  if (!user?.phone) {
    return null;
  }

  const phone = String(user.phone);
  const name = user.name || phone;

  database.run(
    `
      INSERT INTO users (
        phone,
        name,
        created_at
      )
      VALUES (?, ?, ?)
      ON CONFLICT(phone)
      DO UPDATE SET
        name = excluded.name
    `,
    [phone, name, Date.now()]
  );

  saveDatabaseBytes().catch(console.error);

  return getUserByPhone(phone);
}


export function getUserByPhone(phone) {
  const database = requireDatabase();

  if (!phone) {
    return null;
  }

  const result = database.exec(
    `
      SELECT
        phone,
        name,
        created_at
      FROM users
      WHERE phone = ?
      LIMIT 1
    `,
    [String(phone)]
  );

  if (!result.length || !result[0].values.length) {
    return null;
  }

  const row = result[0].values[0];

  return {
    phone: row[0],
    name: row[1],
    created_at: row[2],
  };
}


/* ============================================================
   CREATE / GET CHAT
============================================================ */

export function createOrGetChat({
  chatId,
  userPhone,
  isGroup = false,
  name = "",
  members = [],
}) {
  const database = requireDatabase();

  if (!chatId) {
    throw new Error("chatId is required");
  }

  const now = Date.now();

  const existing = database.exec(
    `
      SELECT *
      FROM chats
      WHERE chat_id = ?
      LIMIT 1
    `,
    [chatId]
  );

  if (existing.length && existing[0].values.length) {
    const row = existing[0].values[0];

    return mapChatRow(row);
  }

  const safeMembers = Array.from(
    new Set(
      members
        .filter(Boolean)
        .map(String)
    )
  );

  database.run(
    `
      INSERT INTO chats (
        chat_id,
        user_phone,
        is_group,
        name,
        members,
        last_message,
        last_message_time,
        unread_count,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      chatId,
      userPhone || "",
      isGroup ? 1 : 0,
      name || "",
      JSON.stringify(safeMembers),
      "",
      null,
      0,
      now,
      now,
    ]
  );

  saveDatabaseBytes().catch(console.error);

  return getChatById(chatId);
}


/* ============================================================
   GET CHAT BY ID
============================================================ */

function getChatById(chatId) {
  const database = requireDatabase();

  const result = database.exec(
    `
      SELECT
        chat_id,
        user_phone,
        is_group,
        name,
        members,
        last_message,
        last_message_time,
        unread_count,
        created_at,
        updated_at
      FROM chats
      WHERE chat_id = ?
      LIMIT 1
    `,
    [chatId]
  );

  if (!result.length || !result[0].values.length) {
    return null;
  }

  return mapChatRow(result[0].values[0]);
}


/* ============================================================
   GET ALL CHATS
============================================================ */

export function getChats() {
  const database = requireDatabase();

  const result = database.exec(`
    SELECT
      chat_id,
      user_phone,
      is_group,
      name,
      members,
      last_message,
      last_message_time,
      unread_count,
      created_at,
      updated_at
    FROM chats
    ORDER BY
      COALESCE(last_message_time, updated_at) DESC
  `);

  if (!result.length) {
    return [];
  }

  return result[0].values.map(mapChatRow);
}


/* ============================================================
   MAP CHAT DATABASE ROW
============================================================ */

function mapChatRow(row) {
  let members = [];

  try {
    members = JSON.parse(row[4] || "[]");
  } catch {
    members = [];
  }

  return {
    chat_id: row[0],
    user_phone: row[1],
    isGroup: !!row[2],
    name: row[3] || "",
    members,
    last_message: row[5] || "",
    last_message_time: row[6],
    unread_count: Number(row[7] || 0),
    created_at: row[8],
    updated_at: row[9],
  };
}


/* ============================================================
   CLEAR UNREAD
============================================================ */

export function clearUnread(chatId) {
  const database = requireDatabase();

  database.run(
    `
      UPDATE chats
      SET unread_count = 0,
          updated_at = ?
      WHERE chat_id = ?
    `,
    [Date.now(), chatId]
  );

  saveDatabaseBytes().catch(console.error);
}


/* ============================================================
   SAVE MESSAGE
============================================================ */

export function saveMessage(data, options = {}) {
  const database = requireDatabase();

  const {
    messageId,
    chatId,
    senderPhone,
    receiverPhone,
    message,
    status = "SENDING",
    createdAt = Date.now(),
    deliveredAt = null,
    readAt = null,
  } = data || {};

  if (!messageId) {
    throw new Error("messageId is required");
  }

  if (!chatId) {
    throw new Error("chatId is required");
  }

  if (!senderPhone) {
    throw new Error("senderPhone is required");
  }

  if (!receiverPhone) {
    throw new Error("receiverPhone is required");
  }

  if (message == null) {
    throw new Error("message is required");
  }

  /*
  ------------------------------------------------------------
  CHECK DUPLICATE
  ------------------------------------------------------------
  */

  const existing = database.exec(
    `
      SELECT message_id
      FROM messages
      WHERE message_id = ?
      LIMIT 1
    `,
    [messageId]
  );

  if (existing.length && existing[0].values.length) {
    return {
      inserted: false,
      message: getMessageById(messageId),
    };
  }

  /*
  ------------------------------------------------------------
  INSERT MESSAGE
  ------------------------------------------------------------
  */

  database.run(
    `
      INSERT INTO messages (
        message_id,
        chat_id,
        sender_phone,
        receiver_phone,
        message,
        status,
        created_at,
        delivered_at,
        read_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      messageId,
      chatId,
      senderPhone,
      receiverPhone,
      String(message),
      status,
      createdAt,
      deliveredAt,
      readAt,
    ]
  );

  /*
  ------------------------------------------------------------
  UPDATE CHAT LAST MESSAGE
  ------------------------------------------------------------
  */

  const bumpUnread = options.bumpUnread === true;

  database.run(
    `
      UPDATE chats
      SET
        last_message = ?,
        last_message_time = ?,
        unread_count =
          CASE
            WHEN ? = 1 THEN unread_count + 1
            ELSE unread_count
          END,
        updated_at = ?
      WHERE chat_id = ?
    `,
    [
      String(message),
      createdAt,
      bumpUnread ? 1 : 0,
      Date.now(),
      chatId,
    ]
  );

  /*
  ------------------------------------------------------------
  PERSIST SQLITE
  ------------------------------------------------------------
  */

  saveDatabaseBytes().catch(console.error);

  return {
    inserted: true,
    message: getMessageById(messageId),
  };
}


/* ============================================================
   GET MESSAGE BY ID
============================================================ */

function getMessageById(messageId) {
  const database = requireDatabase();

  const result = database.exec(
    `
      SELECT
        message_id,
        chat_id,
        sender_phone,
        receiver_phone,
        message,
        status,
        created_at,
        delivered_at,
        read_at
      FROM messages
      WHERE message_id = ?
      LIMIT 1
    `,
    [messageId]
  );

  if (!result.length || !result[0].values.length) {
    return null;
  }

  return mapMessageRow(result[0].values[0]);
}


/* ============================================================
   GET MESSAGES BY CHAT
============================================================ */

export function getMessagesByChatId(chatId, options = {}) {
  const database = requireDatabase();

  const limit = Math.max(
    1,
    Math.min(
      Number(options.limit || 50),
      500
    )
  );

  let sql = `
    SELECT
      message_id,
      chat_id,
      sender_phone,
      receiver_phone,
      message,
      status,
      created_at,
      delivered_at,
      read_at
    FROM messages
    WHERE chat_id = ?
  `;

  const params = [chatId];

  if (options.beforeTimestamp != null) {
    sql += `
      AND created_at < ?
    `;

    params.push(Number(options.beforeTimestamp));
  }

  sql += `
    ORDER BY created_at DESC
    LIMIT ?
  `;

  params.push(limit);

  const result = database.exec(sql, params);

  if (!result.length) {
    return [];
  }

  /*
  SQL gets newest → oldest.
  UI wants oldest → newest.
  */

  return result[0].values
    .map(mapMessageRow)
    .reverse();
}


/* ============================================================
   MAP MESSAGE ROW
============================================================ */

function mapMessageRow(row) {
  return {
    message_id: row[0],
    chat_id: row[1],
    sender_phone: row[2],
    receiver_phone: row[3],
    message: row[4],
    status: row[5],
    created_at: row[6],
    delivered_at: row[7],
    read_at: row[8],
  };
}


/* ============================================================
   UPDATE MESSAGE STATUS
============================================================ */

export function updateMessageStatus(messageId, status) {
  const database = requireDatabase();

  const normalizedStatus = String(status || "").toUpperCase();

  let deliveredAt = null;
  let readAt = null;

  if (normalizedStatus === "DELIVERED") {
    deliveredAt = Date.now();
  }

  if (normalizedStatus === "READ") {
    readAt = Date.now();
  }

  database.run(
    `
      UPDATE messages
      SET
        status = ?,
        delivered_at =
          CASE
            WHEN ? IS NOT NULL THEN ?
            ELSE delivered_at
          END,
        read_at =
          CASE
            WHEN ? IS NOT NULL THEN ?
            ELSE read_at
          END
      WHERE message_id = ?
    `,
    [
      normalizedStatus,
      deliveredAt,
      deliveredAt,
      readAt,
      readAt,
      messageId,
    ]
  );

  saveDatabaseBytes().catch(console.error);
}


/* ============================================================
   MARK MESSAGES AS READ
============================================================ */

export function markMessagesAsRead(chatId, myPhone) {
  const database = requireDatabase();

  const result = database.exec(
    `
      SELECT message_id
      FROM messages
      WHERE
        chat_id = ?
        AND receiver_phone = ?
        AND status != 'READ'
    `,
    [chatId, myPhone]
  );

  const messageIds = result.length
    ? result[0].values.map((row) => row[0])
    : [];

  if (messageIds.length === 0) {
    return [];
  }

  const now = Date.now();

  database.run(
    `
      UPDATE messages
      SET
        status = 'READ',
        read_at = ?
      WHERE
        chat_id = ?
        AND receiver_phone = ?
        AND status != 'READ'
    `,
    [
      now,
      chatId,
      myPhone,
    ]
  );

  database.run(
    `
      UPDATE chats
      SET
        unread_count = 0,
        updated_at = ?
      WHERE chat_id = ?
    `,
    [
      now,
      chatId,
    ]
  );

  saveDatabaseBytes().catch(console.error);

  return messageIds;
}


/* ============================================================
   BACKUP DATABASE
============================================================ */

export async function exportDatabaseFile() {
  const database = requireDatabase();

  /*
  Make sure latest changes are persisted.
  */

  await saveDatabaseBytes();

  const bytes = database.export();

  const blob = new Blob(
    [bytes],
    {
      type: "application/x-sqlite3",
    }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = `chat-backup-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.chatdb`;

  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);
}


/* ============================================================
   RESTORE DATABASE
============================================================ */

export async function importDatabaseFile(file) {
  if (!file) {
    throw new Error("No database file selected");
  }

  if (!SQL) {
    throw new Error("SQLite engine is not initialized");
  }

  const arrayBuffer = await file.arrayBuffer();

  const bytes = new Uint8Array(arrayBuffer);

  /*
  ------------------------------------------------------------
  OPEN BACKUP DATABASE FIRST
  ------------------------------------------------------------
  */

  let importedDb;

  try {
    importedDb = new SQL.Database(bytes);
  } catch {
    throw new Error(
      "Invalid SQLite backup file"
    );
  }

  /*
  ------------------------------------------------------------
  VALIDATE REQUIRED TABLES
  ------------------------------------------------------------
  */

  const tables = importedDb.exec(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
  `);

  const tableNames = tables.length
    ? tables[0].values.map((row) => row[0])
    : [];

  const requiredTables = [
    "users",
    "chats",
    "messages",
  ];

  const missingTables = requiredTables.filter(
    (table) => !tableNames.includes(table)
  );

  if (missingTables.length > 0) {
    importedDb.close();

    throw new Error(
      `Invalid backup. Missing tables: ${missingTables.join(", ")}`
    );
  }

  /*
  ------------------------------------------------------------
  REPLACE CURRENT DATABASE
  ------------------------------------------------------------
  */

  if (db) {
    db.close();
  }

  db = importedDb;

  /*
  ------------------------------------------------------------
  PERSIST RESTORED DATABASE
  ------------------------------------------------------------
  */

  await saveDatabaseBytes();

  initialized = true;

  console.log("SQLite database restored successfully");

  return true;
}


/* ============================================================
   OPTIONAL: CLEAR COMPLETE LOCAL DATABASE
============================================================ */

export async function clearDatabase() {
  if (!db) {
    return;
  }

  db.close();

  db = new SQL.Database();

  createTables();

  await saveDatabaseBytes();

  console.log("Local SQLite database cleared");
}


/* ============================================================
   OPTIONAL: GET DATABASE STATS
============================================================ */

export function getDatabaseStats() {
  const database = requireDatabase();

  const users = database.exec(`
    SELECT COUNT(*) FROM users
  `);

  const chats = database.exec(`
    SELECT COUNT(*) FROM chats
  `);

  const messages = database.exec(`
    SELECT COUNT(*) FROM messages
  `);

  return {
    users: users[0]?.values[0]?.[0] || 0,
    chats: chats[0]?.values[0]?.[0] || 0,
    messages: messages[0]?.values[0]?.[0] || 0,
  };
}