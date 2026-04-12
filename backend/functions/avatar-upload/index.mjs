import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3     = new S3Client({ region: "us-east-1" });
const BUCKET = process.env.AVATAR_BUCKET;

export const handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*" };

  try {
    let claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims?.sub) {
      const auth = event.headers?.Authorization ?? event.headers?.authorization ?? "";
      if (auth.startsWith("Bearer ")) {
        try {
          const payload = auth.split(".")[1];
          claims = JSON.parse(Buffer.from(payload, "base64url").toString());
        } catch { claims = null; }
      }
    }

    if (!claims?.sub) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const contentType = event.queryStringParameters?.contentType || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid content type" }) };
    }

    const userId = claims.sub;
    const key    = `avatars/${userId}`;

    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
        CacheControl: "public, max-age=3600",
      }),
      { expiresIn: 300 }
    );

    return { statusCode: 200, headers, body: JSON.stringify({ url, key }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
