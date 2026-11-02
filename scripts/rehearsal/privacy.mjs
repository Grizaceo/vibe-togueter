export async function rehearsePrivacy({ navigate, check, evaluate, capture }) {
  await navigate("/privacy.html");
  check(
    "privacy page shows supplied operator/contact and pending hosting",
    await evaluate(
      "document.body.textContent.includes('Cristóbal Muñoz')&&!!document.querySelector('a[href=\"mailto:cristobal.munoz@derecho.uchile.cl\"]')&&document.body.textContent.includes('[OWNER MUST COMPLETE BEFORE PUBLIC USE]')",
    ),
  );
  await capture("local-ui-privacy");
}
