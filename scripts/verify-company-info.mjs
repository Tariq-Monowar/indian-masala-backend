import "dotenv/config";

const res = await fetch("http://127.0.0.1:8080/api/company_info/get");
console.log("GET", res.status, await res.text());
