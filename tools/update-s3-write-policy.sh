#!/usr/bin/env bash
set -euo pipefail
profile="${AWS_PROFILE:-default}"
policy_name="${AWS_POLICY_NAME:-pumpstreams-ingest-write}"    # optional override
bucket="${AWS_S3_BUCKET:?Environment variable AWS_S3_BUCKET must be set}"
cat <<POLICY > /tmp/pumpstreams_s3_policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSnapshotUploads",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::${bucket}/*"
    },
    {
      "Sid": "AllowBucketList",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::${bucket}"
    }
  ]
}
POLICY
aws iam create-policy \ 
  --policy-name "$policy_name" \ 
  --policy-document file:///tmp/pumpstreams_s3_policy.json \ 
  --profile "$profile" || true
rm /tmp/pumpstreams_s3_policy.json
