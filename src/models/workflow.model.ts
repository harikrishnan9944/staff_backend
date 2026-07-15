import { Schema, model } from 'mongoose';

// Stub model to prevent compiler errors from deleted workflow collections
const WorkflowSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
  materialId: { type: Schema.Types.ObjectId, ref: 'Material' },
  status: { type: String, default: 'Pending' }
});

export const MaterialWorkflow = model('MaterialWorkflow', WorkflowSchema);
