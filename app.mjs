import express from "express";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const { PORT, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME } = process.env;

const app = express();

const s3Client = new S3Client({
	region: "us-east-1",
	endpoint: S3_ENDPOINT,
	credentials: {
		accessKeyId: S3_ACCESS_KEY_ID,
		secretAccessKey: S3_SECRET_ACCESS_KEY
	}
});

const bucketName = S3_BUCKET_NAME;

app.get("/video/:filename", async (req, res) => {
	const videoFilename = req.params.filename;

	try {
		const headCommand = new HeadObjectCommand({ Bucket: bucketName, Key: videoFilename });
		const headResponse = await s3Client.send(headCommand);
		const contentLength = headResponse.ContentLength;

		const range = req.headers.range;
		if (!range) {
			const command = new GetObjectCommand({ Bucket: bucketName, Key: videoFilename });
			const { Body } = await s3Client.send(command);
			res.setHeader("Content-Type", "video/mp4");
			res.setHeader("Content-Length", contentLength);
			return Body.pipe(res);
		}

		const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
		const start = parseInt(startStr, 10);
		const end = endStr ? parseInt(endStr, 10) : contentLength - 1;

		if (start >= contentLength || end >= contentLength) {
			res.status(416).set("Content-Range", `bytes */${contentLength}`).end();
			return;
		}

		const rangeParams = {
			Bucket: bucketName,
			Key: videoFilename,
			Range: `bytes=${start}-${end}`
		};

		const command = new GetObjectCommand(rangeParams);
		const { Body } = await s3Client.send(command);

		res.status(206);
		res.set({
			"Content-Type": "video/mp4",
			"Content-Length": end - start + 1,
			"Accept-Ranges": "bytes",
			"Content-Range": `bytes ${start}-${end}/${contentLength}`
		});

		Body.pipe(res);
	} catch (error) {
		console.error("Error streaming video:", error);
		res.status(500).send("Error streaming video.");
	}
});

app.listen(PORT, () => {
	console.log(`wasabi-streaming-app running at http://localhost:${PORT}`);
});
