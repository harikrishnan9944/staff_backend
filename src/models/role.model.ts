import { Schema, model } from 'mongoose';

// Stub model to prevent compiler errors from deleted Role collection
const RoleSchema = new Schema({
  name: { type: String, required: true, unique: true },
  permissions: { type: [String], default: [] }
});

export const Role = model('Role', RoleSchema);
