const https = require("https");

module.exports = (req, res) => {
  const username = req.query.user;

  if (!username) {
    res.status(400).send("Missing ?user=username");
    return;
  }

  const url = `https://www.codechef.com/users/${username}`;

  https
    .get(url, (response) => {
      let data = "";

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        if (data.includes("404")) {
          res.status(404).send("User not found");
          return;
        }

        const ratingMatch = data.match(/rating-number">(\d+)</);
        const starsMatch = data.match(/rating-star">(\d+.\d+)</);

        const rating = ratingMatch ? ratingMatch[1] : "N/A";
        const stars = starsMatch ? starsMatch[1] : "N/A";

        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="300" height="80">
          <rect width="300" height="80" rx="10" fill="#1e1e2f" />
          <text x="20" y="35" fill="#fff" font-size="20">CodeChef: ${username}</text>
          <text x="20" y="60" fill="#50fa7b" font-size="16">Rating: ${rating} ⭐ ${stars}</text>
        </svg>`;

        res.setHeader("Content-Type", "image/svg+xml");
        res.send(svg);
      });
    })
    .on("error", (err) => {
      res.status(500).send("Server error");
    });
};
