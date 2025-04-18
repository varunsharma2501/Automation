const { getJson } = require("serpapi");

getJson({
  api_key: "1ae468e331af5ac917332a935804fec981f6579fb92688554c6713501ba001be",
  engine: "google",
  q: "give me upfitters for arizona",
  location: "Austin, Texas, United States",
  google_domain: "google.com",
  gl: "us",
  hl: "en"
}, (json) => {
  console.log(json);
});