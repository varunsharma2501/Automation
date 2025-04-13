const express = require("express");
const dotenv = require("dotenv");
const automationRoutes = require("./routes/automation");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/api/automation", automationRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});



