import pkg from 'pg';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Create a new PostgreSQL connection pool using the connection string from environment variables
const { Pool } = pkg;

// Export the pool for use in other parts of the application
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Log a message when the pool successfully connects to the PostgreSQL database
pool.on('connect', () => {
  console.log('BluePin connected to the PostgreSQL database successfully!');
});