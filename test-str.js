function str(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    if (typeof val.toDate === "function") {
      try {
        return val.toDate().toISOString();
      } catch {}
    }
    try {
      return String(val);
    } catch (e) {
      return JSON.stringify(val);
    }
  }
  return String(val);
}
console.log(str(Object.create(null)));
