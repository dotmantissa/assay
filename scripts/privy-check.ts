import "../lib/network";
const id = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const response = await fetch(`https://auth.privy.io/api/v1/apps/${id}`, {
  headers: { "privy-app-id": id || "", Origin: "http://localhost:3000" },
});
const data = await response.json();
console.log("Privy public configuration status:", response.status);
console.log("Email login enabled:", data.email_auth);
console.log(
  "Configuration fields:",
  Object.keys(data).filter((k) => /email|domain|origin|login/.test(k)),
);
