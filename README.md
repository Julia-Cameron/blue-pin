# BluePin

BluePin is a collaborative blueprint markup and document review platform for teams that need to review plans, site drawings, and other construction or design documents in one place.

It allows project stakeholders to upload files, leave threaded markup comments, and manage versioned review cycles with a simple web interface.

## Highlights

- Upload blueprint files in PDF, PNG, or JPG format
- Add reviewer comments with metadata like name, role, phone, and email
- Support threaded comment replies and revision tracking
- Store uploaded files locally or in Supabase Storage
- Review and download original or corrected files
- Built for browser-based collaboration and deployment on Render

## Tech Stack

- Node.js
- Express
- PostgreSQL
- Supabase Storage
- HTML / JavaScript front end

## Project Structure

- `src/index.js` – main Express server and API routes
- `src/db.js` – PostgreSQL database connection
- `public/index.html` – frontend interface
- `uploads/` – local file storage fallback
- `render.yaml` – deployment configuration for Render

## Local Development

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the project root with the required environment variables:

```env
DATABASE_URL=your_postgres_connection_string
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_STORAGE_BUCKET=uploads
PORT=5000
```

4. Start the app:

```bash
npm start
```

5. Open the app in your browser at:

```text
http://localhost:5000
```

## Deployment

This project includes a Render configuration in `render.yaml` for deployment.

The production setup expects:

- PostgreSQL database connection via `DATABASE_URL`
- Supabase project credentials for optional cloud storage
- `SUPABASE_STORAGE_BUCKET` configured to `uploads` by default

## API Overview

### Documents

- `GET /api/documents` – list all uploaded documents
- `GET /api/documents/:id` – fetch a document and its markups
- `POST /api/documents` – upload a document
- `DELETE /api/documents/:id` – remove a document
- `GET /api/documents/:id/download` – download a document

### Markups

- `POST /api/documents/:id/markups` – add a comment or markup revision
- `GET /api/documents/:documentId/markups/:markupId/download` – download a corrected file

## Notes

- Files are validated for PDF, PNG, and JPG uploads.
- Uploaded files are fingerprinted to reduce duplicate submissions.
- If Supabase storage is not configured, the app stores files locally in the `uploads/` folder.

## License

This project is currently intended for internal or collaborative use and is not explicitly configured with a public license file.

## Contributing

If you are working on this project, you can contribute by:

- improving the UI and workflow
- adding document versioning enhancements
- refining review permissions and validations
- improving deployment and environment setup
