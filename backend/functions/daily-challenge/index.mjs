const BOWLERS = [
  "malinga", "bumrah", "warne", "murali", "shoaib",
  "wasim", "mcgrath", "kumble", "starc", "steyn",
  "rabada", "boult", "anderson", "harbhajan", "waqar"
];

export const handler = async (event) => {
  const category = event.queryStringParameters?.category || "bowling";
  
  if (category !== "bowling") {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "https://playhowzat.com" },
      body: JSON.stringify({ error: "Invalid category" })
    };
  }

  const today = new Date().toISOString().split("T")[0]; // "2025-04-07"
  const dateNumber = today.replace(/-/g, "");           // "20250407"
  const index = parseInt(dateNumber) % BOWLERS.length;
  const bowler = BOWLERS[index];

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "https://playhowzat.com" },
    body: JSON.stringify({
      category,
      date: today,
      bowler
    })
  };
};