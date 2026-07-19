import mongoose from 'mongoose';
import { AuditLog } from './models/auditLog.model';
import { LoginHistory } from './models/loginHistory.model';

const uri = 'mongodb+srv://hariaiworld2005_db_user:8U8pCzzvH6qOTzVs@cluster0.zlk4cei.mongodb.net/staff_management';

async function test() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected!');

    console.log('Querying AuditLog...');
    const logs = await AuditLog.find({})
      .populate('performedBy', 'name username')
      .populate('targetUserId', 'name username')
      .populate('projectId', 'name');
    console.log('AuditLog success:', logs.length);

    console.log('Querying LoginHistory...');
    const hist = await LoginHistory.find({})
      .populate('userId', 'name username role email employeeId');
    console.log('LoginHistory success:', hist.length);

  } catch (err) {
    console.error('TEST FAILED:', err);
  } finally {
    await mongoose.disconnect();
  }
}

test();
