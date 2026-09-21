from sentence_transformers import SentenceTransformer
from huggingface_hub import snapshot_download
import flask
import werkzeug
import dotenv
import os

# import cors:
from flask_cors import CORS

dotenv.load_dotenv()
# Download the PyTorch model and tokenizer while skipping alternate runtime
# exports. sentence-transformers 2.2 otherwise fetches every ONNX variant in
# this repository before the Flask service can start.
model_path = snapshot_download(
    repo_id="sentence-transformers/all-mpnet-base-v2",
    cache_dir=os.environ.get("HF_HOME", "/models-cache"),
    ignore_patterns=["*.onnx", "*.ot", "*.h5", "openvino/*"],
)
model = SentenceTransformer(model_path)  # 384 word pieces max
# print(model.encode("This is a test sentence"))  # warm up
print("Model loaded")

app = flask.Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})


# path for getting cosine similarity based on two sentences
@app.route("/sentence_embedding", methods=["POST"])
def cosine_similarity():
    print("Request received:")
    # get from body json
    sentence1 = flask.request.json["sentence"]
    # assert sentence1 is not None
    # assert sentence2 is not None
    if sentence1 is None:
        return werkzeug.exceptions.BadRequest("Bad Request")
    emb1 = model.encode(sentence1)
    # cos_sim: Tensor = util.cos_sim(emb1, emb2)
    # result = cos_sim.tolist()[0][0]
    # print(result)
    result = emb1.tolist()
    return flask.jsonify(result)


# health check endpoint
@app.route("/health", methods=["GET"])
def health_check():
    return "OK", 200


if __name__ == "__main__":
    app.run(debug=False, port=8002, host="0.0.0.0")
