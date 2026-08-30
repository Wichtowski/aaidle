import { FaArrowLeft } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";

export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const navigate = useNavigate();

  const goBack = () => {
    const historyIndex = window.history.state?.idx;
    if (typeof historyIndex === "number" && historyIndex > 0) {
      navigate(-1);
      return;
    }

    navigate(fallback, { replace: true });
  };

  return (
    <button aria-label="Go back" className="eyebrow-back" onClick={goBack} type="button">
      <FaArrowLeft aria-hidden="true" />
    </button>
  );
}
