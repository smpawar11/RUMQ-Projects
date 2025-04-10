import mongoose, { Document, Schema } from 'mongoose';

export interface ISavedJob extends Document {
  userSession: string;
  jobId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const SavedJobSchema: Schema = new Schema(
  {
    userSession: { type: String, required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Create a compound index for efficient querying
SavedJobSchema.index({ userSession: 1, jobId: 1 }, { unique: true });

export default mongoose.model<ISavedJob>('SavedJob', SavedJobSchema);
