module.exports = {
  port: 3000,
  db: {
    host: 'localhost',
    port: 5432,
    database: 'scheduler_test_db', // Replace with your actual test database name
    user: 'postgres', // Replace with your actual PostgreSQL user
    password: 'postgres', // Replace with your actual PostgreSQL password
    ssl: false
  },
  jwt: {
    secret: 'super-secret-jwt-token-with-at-least-32-characters-long',
    expiresIn: '1h' // 1 hour
  },
  roles: {
    anon: {
      tables: '*', // Allow anonymous access to all tables for testing
    },
    authenticated: {
      tables: '*',
    }
  }
}; 