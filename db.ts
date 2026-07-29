import { MongoClient, ServerApiVersion } from 'mongodb';
import bcrypt from 'bcrypt';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn('WARNING: MONGODB_URI environment variable is missing.');
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
    if (!database) return false;

    const usersCollection = database.collection('users');
    
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) return false; 
    
    const passwordHash = await bcrypt.hash(passwordPlain, 10);
    await usersCollection.insertOne({
      email, 
      passwordHash, 
      name, 
      companyName, 
      companySize, 
      companyRole, 
      role
    });
    
    return true;
  } catch (error) {
    console.error('Error in registerUser:', error);
    return false;
  }
}

export async function verifyUser(email: string, passwordPlain: string): Promise<{ success: boolean, role?: string, name?: string }> {
  try {
    const database = await connectDB();
    if (!database) return { success: false };

    const usersCollection = database.collection('users');
    const user = await usersCollection.findOne({ email });
    
    if (!user) return { success: false };
    
    const isValid = await bcrypt.compare(passwordPlain, user.passwordHash);
    return { 
      success: isValid, 
      role: isValid ? user.role : undefined, 
      name: isValid ? user.name : undefined 
    };
  } catch (error) {
    console.error('Error in verifyUser:', error);
    return { success: false };
  }
}

export async function addLoginLog(email: string, status: 'success' | 'failed') {
  try {
    const database = await connectDB();
    if (!database) return;

    const loginsCollection = database.collection('logins');
    await loginsCollection.insertOne({ 
      email, 
      loginTime: new Date().toISOString(), 
      status 
    });
  } catch (error) {
    console.error('Error in addLoginLog:', error);
  }
}

export async function getLogins() {
  try {
    const database = await connectDB();
    if (!database) return [];

    const loginsCollection = database.collection('logins');
    return await loginsCollection.find().sort({ loginTime: -1 }).toArray();
  } catch (error) {
    console.error('Error in getLogins:', error);
    return [];
  }
}

export async function deleteUserAndLogins(email: string): Promise<boolean> {
  try {
    const database = await connectDB();
    if (!database) return false;

    const usersCollection = database.collection('users');
    const loginsCollection = database.collection('logins');
    
    const result = await usersCollection.deleteOne({ email });
    await loginsCollection.deleteMany({ email });
    
    return result.deletedCount > 0;
  } catch (error) {
    console.error('Error in deleteUserAndLogins:', error);
    return false;
  }
}
