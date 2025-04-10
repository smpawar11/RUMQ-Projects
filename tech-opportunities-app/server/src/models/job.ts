import mongoose, { Document, Schema } from 'mongoose';

export interface IJob extends Document {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  postedDate: Date;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, required: true },
    url: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    postedDate: { type: Date, required: true },
    source: { type: String, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Create a compound index for efficient searching
JobSchema.index({ title: 'text', company: 'text', description: 'text' });
JobSchema.index({ location: 1 });
JobSchema.index({ postedDate: -1 });
JobSchema.index({ source: 1 });

export default mongoose.model<IJob>('Job', JobSchema);
