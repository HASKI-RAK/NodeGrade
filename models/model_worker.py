from sentence_transformers import SentenceTransformer
import flask
import werkzeug
import dotenv

# import cors:
from flask_cors import CORS

dotenv.load_dotenv()
# model = SentenceTransformer("all-MiniLM-L6-v2")
model = SentenceTransformer(
    "sentence-transformers/all-mpnet-base-v2"
)  # 384 word pieces max
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


if __name__ == "__main__":
    app.run(debug=False, port=8002, host="0.0.0.0")
