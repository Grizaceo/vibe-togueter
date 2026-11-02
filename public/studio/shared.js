import { studioLinkURL } from "../resource-links.js";

export const $ = (id) => document.getElementById(id);
export let state = null,
  socket = null,
  ownerHeaders = null,
  reviewed = null,
  reviewedArtifact = null,
  warmBusy = false;
export const picked = new Set();
export const remoteCreates = new Map();
export const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
export function link(label, url) {
  const node = el("a", label);
  const target = studioLinkURL(url, location.origin);
  if (!target) return el("span", label);
  node.href = target;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  return node;
}
export const message = (id, error) => {
  $(id).textContent = error.message || String(error);
  $(id).classList.add("error");
};
export function send(text) {
  if (socket?.readyState !== 1) {
    message("round-message", "Connect to the web conversation first.");
    return;
  }
  socket.send(JSON.stringify({ t: "chat", text }));
}

export function setState(value) {
  state = value;
}

export function setSocket(value) {
  socket = value;
}

export function setOwnerHeaders(value) {
  ownerHeaders = value;
}

export function setReviewed(value) {
  reviewed = value;
}

export function setReviewedArtifact(value) {
  reviewedArtifact = value;
}

export function setWarmBusy(value) {
  warmBusy = value;
}
