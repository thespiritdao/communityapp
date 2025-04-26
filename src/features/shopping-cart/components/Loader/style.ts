import styled from 'src/features/shopping-cart/commons/style/styled-components';

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px;

  div {
    width: 12px;
    height: 12px;
    margin: 5px;
    background-color: ${({ theme }) => theme.colors.primary};
    border-radius: 50%;
    display: inline-block;
    animation: bounce 1.2s infinite ease-in-out both;
  }

  p {
    margin-top: 10px;
    color: ${({ theme }) => theme.colors.secondary};
    font-size: 14px;
  }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }
`;
