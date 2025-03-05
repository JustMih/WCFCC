const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sequelize = require("./config/mysql_connection.js");
const routes = require("./routes");
const { registerSuperAdmin } = require("./controllers/auth/authController");

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());
app.use("/api", routes);

sequelize.sync({ alter: true }).then(() => {
  console.log("Database synced");
  registerSuperAdmin(); // Ensure Super Admin is created at startup
});

const PORT = process.env.PORT || 5010;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
