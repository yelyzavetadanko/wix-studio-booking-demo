export function readQuery() {
  const params = new URLSearchParams(window.location.search);
  const out = {};
  params.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export default {
  get query() {
    return readQuery();
  },
  get url() {
    return window.location.href;
  },
};
