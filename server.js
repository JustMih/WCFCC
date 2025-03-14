const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sequelize = require("./config/mysql_connection.js");
const routes = require("./routes");
const { registerSuperAdmin } = require("./controllers/auth/authController");
const {
  connectAsterisk,
  makeCall,
} = require("./controllers/ami/amiController");

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());
app.use("/api", routes);

// Ensure Asterisk is connected before syncing the database and starting the server
connectAsterisk()
  .then(() => {
    console.log("Asterisk connected successfully");

    sequelize.sync({ force: false, alter: false }).then(() => {
      console.log("Database synced");
      registerSuperAdmin(); // Ensure Super Admin is created at startup
    });

    const PORT = process.env.PORT || 5070;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((error) => {
    console.error("Asterisk connection failed:", error);
    process.exit(1); // Exit the process if Asterisk connection fails
  });
