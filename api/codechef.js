import fetch from "node-fetch";

export default async function handler(req, res) {
  const username = req.query.user;

  if (!username)
    return res.status(400).send("User is required: ?user=username");

  const response = await fetch(
    `https://www.codechef.com/users/${username}`
  );

  if (!response.ok)
    return res.status(404).send("User not found on CodeChef");

  const html = await response.text();

  // Extract rating
  const ratingMatch = html.match(/"rating-number">\s*(\d+)\s*</);
  const rating = ratingMatch ? ratingMatch[1] : "N/A";

  // Extract stars
  const starsMatch = html.match(/class="rating-star">\s*([\d.]+)\s*</);
  const stars = starsMatch ? starsMatch[1] : "N/A";

  // SVG Badge
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="300" height="70">
    <rect width="300" height="70" fill="#1e1e2f" rx="8"></rect>
    <text x="20" y="30" fill="#fff" font-size="18">CodeChef: ${username}</text>
    <text x="20" y="55" fill="#50fa7b" font-size="16">Rating: ${rating} ⭐ ${stars}</text>
  </svg>`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.status(200).send(svg);
}
