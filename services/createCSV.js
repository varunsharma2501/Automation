const fs = require("fs");
const path = require("path");
const { Parser } = require("json2csv");

const generateCSV = (data) => {
  console.log("Generating csv for the cities")
  const fields = ["name", "location", "overview", "contact","companyUrl"]; // must match keys in data
  const opts = { fields };

  try {
    const parser = new Parser(opts);
    const csv = parser.parse(data);

    const folderPath = path.join(__dirname, "..", "Excels");
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(folderPath, `response_${timestamp}.csv`);

    fs.writeFileSync(filePath, csv);
    console.log(`✅ CSV file saved to: ${filePath}`);
  } catch (err) {
    console.error("❌ Error generating CSV:", err.message);
  }
};

module.exports = generateCSV;
