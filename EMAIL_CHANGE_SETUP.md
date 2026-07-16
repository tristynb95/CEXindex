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
