// config/database.ts
type Environment = "development" | "production" | "test";

interface DatabaseConfig {
  url: string;
  options: {
    useNewUrlParser: boolean;
    useUnifiedTopology: boolean;
  };
}

type DatabaseConfigs = {
  [key in Environment]: DatabaseConfig;
};

export const DATABASE_CONFIG: DatabaseConfigs = {
  development: {
    url:
      process.env.MONGODB_URI ||
      `mongodb+srv://romario7kavin:${process.env.DB_PASS}@decimal.lqtxi.mongodb.net/?retryWrites=true&w=majority&appName=decimal`,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  production: {
    url: process.env.MONGODB_URI || "",
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  test: {
    url:
      process.env.TEST_MONGODB_URI ||
      "mongodb://localhost:27017/decimal_bridge_test",
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
};
