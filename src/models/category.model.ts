import { Schema, model, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: String,
      default: '#CCCCCC',
    },
  },
  {
    timestamps: true,
  }
);

export const Category = model<ICategory>('Category', CategorySchema);
