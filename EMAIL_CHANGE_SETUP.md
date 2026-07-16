# Email change confirmation setup

The profile page now uses Firebase `verifyBeforeUpdateEmail`. The account email is unchanged until the recipient follows the confirmation link, and the custom handler refuses to apply a request more than 15 minutes after it was created.

## Required Firebase configuration

1. Deploy `email-confirm.html`, `js/email-confirm.js`, and the rest of the Hosting files.
2. Deploy the rules in `database.rules.reference.json` to the Realtime Database.
3. In Firebase Console, open **Authentication → Templates** and edit the email template used for email-address changes/verification.
4. Choose **Customize action URL** and set it to:

   `https://cexindex.web.app/email-confirm.html`

   Use the equivalent URL if the site is hosted on a custom domain.
5. In **Authentication → Settings → Authorized domains**, ensure the production Hosting/custom domain is present.

### Do not use the "Customize domain" field

Firebase has two similarly named settings:

- **Customize action URL** sets the complete page that handles the email action. The `web.app` URL above belongs here.
- **Customize domain** / `linkDomain` expects a separately connected custom domain. Firebase does not allow a default `web.app` or `firebaseapp.com` Hosting domain in that field.

If the dialog says **Customize domain**, close it and return to the template's **Customize action URL** setting.

### Current Firebase backend blocker

For project `cexindex`, both the Console and the supported Identity Platform Admin API currently reject a custom callback with:

`400 INVALID_ARGUMENT: EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`

This was reproduced after confirming that:

- `https://cexindex.web.app/email-confirm.html` is deployed and returns HTTP 200.
- Both `cexindex.web.app` and `cexindex.firebaseapp.com` are authorized domains.
- The project uses standard `FIREBASE_AUTH`, not multi-tenancy or custom SMTP.
- The signed-in account can read and update the project configuration; a no-change callback update succeeds.

The callback therefore remains `https://cexindex.firebaseapp.com/__/auth/action`. Firebase Support needs to remove or explain the email-template restriction before the 15-minute handler can be enabled. Include the project ID, requested callback, and exact backend error in the support request.

The custom action URL is mandatory for the 15-minute rule. Firebase's default action handler does not consult the app's pending-request deadline.

## How cancellation works

- A random, single-use pending request is stored in Realtime Database. Email addresses are stored only on the private user profile; the publicly readable capability record contains SHA-256 hashes rather than addresses.
- The profile shows a live 15-minute countdown and allows manual cancellation.
- The custom email handler checks that the request still exists, is still pending, is within the deadline, and matches Firebase's action-code metadata before applying the code.
- Once expired or cancelled, the handler refuses the link and the Firebase account email remains unchanged.
- Successful changes are synchronized to `users/{uid}` immediately when the confirming browser is signed in, or on the user's next sign-in otherwise.

Firebase references:

- https://firebase.google.com/docs/reference/js/auth#verifybeforeupdateemail
- https://firebase.google.com/docs/auth/custom-email-handler
