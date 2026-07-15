import { Schema, model, Document, Types } from 'mongoose';

export interface IDocumentActivity {
  action: string;
  userId: Types.ObjectId;
  timestamp: Date;
}

export interface IDocument extends Document {
  name: string;
  fileUrl: string;
  fileType: 'PDF' | 'Image' | 'Excel' | 'Word' | 'CAD' | 'ZIP' | string;
  fileSize: number; // in bytes
  folder: 'Project' | 'Material' | 'Vendor' | 'Purchase' | 'Invoice' | string;
  projectId?: Types.ObjectId;
  materialId?: Types.ObjectId;
  vendorId?: Types.ObjectId;
  purchaseId?: Types.ObjectId;
  invoiceId?: Types.ObjectId;
  version: number;
  activityLog: IDocumentActivity[];
  uploadedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    name: {
      type: String,
      required: [true, 'Document name is required'],
      trim: true,
    },
    fileUrl: {
      type: String,
      required: [true, 'File URL is required'],
    },
    fileType: {
      type: String,
      enum: ['PDF', 'Image', 'Excel', 'Word', 'CAD', 'ZIP'],
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
      min: 0,
    },
    folder: {
      type: String,
      enum: ['Project', 'Material', 'Vendor', 'Purchase', 'Invoice'],
      required: true,
    },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    materialId: { type: Schema.Types.ObjectId, ref: 'Material' },
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
    purchaseId: { type: Schema.Types.ObjectId, ref: 'Purchase' },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    version: {
      type: Number,
      default: 1,
    },
    activityLog: [
      {
        action: { type: String, required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
DocumentSchema.index({ projectId: 1, folder: 1 });

export const DocumentFile = model<IDocument>('DocumentFile', DocumentSchema);
