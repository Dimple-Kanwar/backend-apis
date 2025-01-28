import mongoose from 'mongoose'
import "dotenv/config";

export const connectDB = async() => {
    await mongoose.connect(process.env.MONGO_URL!, {}).then(()=> {
        console.log("Mongo Db connected!!");
    }).catch((err) => {
        console.error(`Mongo Connection Error: ${err}`);
    });
}
