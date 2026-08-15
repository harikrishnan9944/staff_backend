import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/user.model';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function checkTokens() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB Connected successfully.');

    const users = await User.find({}, 'name username role email pushToken pushTokens updatedAt').sort({ updatedAt: -1 });
    console.log(`\n=== CURRENT USER PUSH TOKENS IN MONGODB (${users.length} users) ===\n`);
    
    users.forEach((u) => {
      console.log(`User: ${u.username} (${u.name}) - Role: ${u.role}`);
      console.log(`  pushToken: "${u.pushToken || 'EMPTY'}"`);
      console.log(`  pushTokens count: ${u.pushTokens?.length || 0}`);
      console.log(`  Last Updated: ${u.updatedAt}\n`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

checkTokens();
