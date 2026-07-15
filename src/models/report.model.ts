import { Schema, model, Document, Types } from 'mongoose';

export interface IReportExport extends Document {
  reportType: 'Project' | 'Purchase' | 'Material' | 'Vendor' | 'Payment' | string;
  format: 'PDF' | 'Excel' | 'CSV';
  dateRange: {
    start: Date;
    end: Date;
  };
  generatedBy: Types.ObjectId;
  fileUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReportExportSchema = new Schema<IReportExport>(
  {
    reportType: {
      type: String,
      enum: ['Project', 'Purchase', 'Material', 'Vendor', 'Payment'],
      required: true,
    },
    format: {
      type: String,
      enum: ['PDF', 'Excel', 'CSV'],
      required: true,
    },
    dateRange: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    generatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const ReportExport = model<IReportExport>('ReportExport', ReportExportSchema);
