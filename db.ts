import { MongoClient, ServerApiVersion } from 'mongodb';
import bcrypt from 'bcrypt';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn('WARNING: MONGODB_URI environment variable is missing. Using local JSON fallback.');
}

// Global variable to cache the client across Vercel serverless function calls
let cachedClient: MongoClient | null = null;
let cachedDb: any = null;

async function connectDB() {
  if (cachedDb) {
    return cachedDb;
  }

  if (!MONGODB_URI) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 10000, // Prevents hanging indefinitely
      socketTimeoutMS: 45000,
    });
  }

  try {
    await cachedClient.connect();
    cachedDb = cachedClient.db("NexusAnalytics");
    console.log('Successfully connected to MongoDB Atlas!');
    return cachedDb;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    cachedClient = null;
    cachedDb = null;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Local JSON fallback (used when MONGODB_URI is not set)
// Stores users and login logs in local .json files in the project root.
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), '.local_users.json');
const LOGS_FILE = path.join(process.cwd(), '.local_logins.json');

function readJSON(filePath: string): any[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return [];
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function writeJSON(filePath: string, data: any[]) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Exported Functions for server.ts
export async function registerUser(
  email: string, 
  passwordPlain: string, 
  name?: string,
  companyName?: string,
  companySize?: string,
  companyRole?: string,
  role: 'admin' | 'user' = 'user'
): Promise<boolean> {
  try {
    const database = await connectDB();
    
    if (database) {
      // MongoDB path
      const usersCollection = database.collection('users');
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) return false; 
      const passwordHash = await bcrypt.hash(passwordPlain, 10);
      await usersCollection.insertOne({ email, passwordHash, name, companyName, companySize, companyRole, role });
      return true;
    } else {
      // Local JSON fallback
      const users = readJSON(USERS_FILE);
      if (users.find((u: any) => u.email === email)) return false;
      const passwordHash = await bcrypt.hash(passwordPlain, 10);
      users.push({ email, passwordHash, name, companyName, companySize, companyRole, role });
      writeJSON(USERS_FILE, users);
      console.log(`[Local DB] Registered user: ${email}`);
      return true;
    }
  } catch (error) {
    console.error('Error in registerUser:', error);
    return false;
  }
}

export async function verifyUser(email: string, passwordPlain: string): Promise<{ success: boolean, role?: string, name?: string }> {
  try {
    const database = await connectDB();

    if (database) {
      // MongoDB path
      const usersCollection = database.collection('users');
      const user = await usersCollection.findOne({ email });
      if (!user) return { success: false };
      const isValid = await bcrypt.compare(passwordPlain, user.passwordHash);
      return { success: isValid, role: isValid ? user.role : undefined, name: isValid ? user.name : undefined };
    } else {
      // Local JSON fallback
      const users = readJSON(USERS_FILE);
      const user = users.find((u: any) => u.email === email);
      if (!user) return { success: false };
      const isValid = await bcrypt.compare(passwordPlain, user.passwordHash);
      console.log(`[Local DB] Login attempt for ${email}: ${isValid ? 'success' : 'failed'}`);
      return { success: isValid, role: isValid ? user.role : undefined, name: isValid ? user.name : undefined };
    }
  } catch (error) {
    console.error('Error in verifyUser:', error);
    return { success: false };
  }
}

export async function addLoginLog(email: string, status: 'success' | 'failed') {
  try {
    const database = await connectDB();

    if (database) {
      const loginsCollection = database.collection('logins');
      await loginsCollection.insertOne({ email, loginTime: new Date().toISOString(), status });
    } else {
      // Local JSON fallback
      const logs = readJSON(LOGS_FILE);
      logs.unshift({ email, loginTime: new Date().toISOString(), status });
      writeJSON(LOGS_FILE, logs.slice(0, 1000));
    }
  } catch (error) {
    console.error('Error in addLoginLog:', error);
  }
}

export async function getLogins() {
  try {
    const database = await connectDB();

    if (database) {
      const loginsCollection = database.collection('logins');
      return await loginsCollection.find().sort({ loginTime: -1 }).toArray();
    } else {
      return readJSON(LOGS_FILE);
    }
  } catch (error) {
    console.error('Error in getLogins:', error);
    return [];
  }
}

export async function deleteUserAndLogins(email: string): Promise<boolean> {
  try {
    const database = await connectDB();

    if (database) {
      const usersCollection = database.collection('users');
      const loginsCollection = database.collection('logins');
      const result = await usersCollection.deleteOne({ email });
      await loginsCollection.deleteMany({ email });
      return result.deletedCount > 0;
    } else {
      // Local JSON fallback
      const users = readJSON(USERS_FILE);
      const newUsers = users.filter((u: any) => u.email !== email);
      const deleted = newUsers.length < users.length;
      writeJSON(USERS_FILE, newUsers);
      const logs = readJSON(LOGS_FILE);
      writeJSON(LOGS_FILE, logs.filter((l: any) => l.email !== email));
      return deleted;
    }
  } catch (error) {
    console.error('Error in deleteUserAndLogins:', error);
    return false;
  }
}
