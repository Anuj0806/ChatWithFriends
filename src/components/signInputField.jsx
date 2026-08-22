import { useState } from "react";

const InputField = ({ type, placeholder, icon, name, value, onChange, error }) => {
  const [isPasswordShown, setIsPasswordShown] = useState(false);

  return (
    <div className="input-wrapper">
      <i className="material-symbols-rounded input-icon">{icon}</i>
      <input
        type={isPasswordShown ? "text" : type}
        placeholder={placeholder}
        className="input-field"
        name={name}
        value={value}
        onChange={onChange}
        required
      />
      {type === "password" && (
        <i
          onClick={() => setIsPasswordShown((p) => !p)}
          className="material-symbols-rounded eye-icon"
        >
          {isPasswordShown ? "visibility" : "visibility_off"}
        </i>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
};

export default InputField;
